"""Completing a chain must not become trusting anything.

WHY THIS IS THE MOST IMPORTANT TEST IN THIS DIRECTORY

tls_chain.py exists so KNBS can be read: its server sends a leaf certificate
without the intermediate that links it to a trusted root, so verification fails
with "unable to get local issuer certificate". The fix fetches the missing
intermediate and retries against a completed bundle.

The failure mode is not that it might not work. It is that it might work TOO
well — that in the course of making one legitimate chain verifiable, it quietly
accepts certificates it should refuse. `verify=False` is one careless edit away
from this file, and the difference is invisible in a green pipeline: both
versions fetch the page.

So this builds a real PKI in memory — root, intermediate, leaf — serves the
leaf WITHOUT its intermediate over real TLS on localhost, and asserts BOTH
directions:

  * the completed bundle verifies the chain that was always valid
  * a self-signed impostor is STILL REJECTED with the machinery in place

The second assertion is the one that matters. If it ever fails, this module is
worse than the problem it solves, because the figures it fetches would be
published as fact.
"""
import datetime
import http.server
import socket
import ssl
import sys
import tempfile
import threading
from pathlib import Path

import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

import tls_chain

FAILURES: list = []
TMP = Path(tempfile.mkdtemp(prefix="tls-chain-test-"))


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _sign(subject, issuer_name, subject_key, issuer_key, *, ca: bool, aia: str | None = None,
          san: str | None = None):
    now = datetime.datetime.now(datetime.timezone.utc)
    b = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer_name)
        .public_key(subject_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    if aia:
        b = b.add_extension(
            x509.AuthorityInformationAccess([
                x509.AccessDescription(
                    x509.oid.AuthorityInformationAccessOID.CA_ISSUERS,
                    x509.UniformResourceIdentifier(aia),
                )
            ]),
            critical=False,
        )
    if san:
        b = b.add_extension(
            x509.SubjectAlternativeName([x509.DNSName(san)]), critical=False
        )
    return b.sign(issuer_key, hashes.SHA256())


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _serve_https(certfile: Path, keyfile: Path, port: int, body: bytes) -> threading.Thread:
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):  # silence
            pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile, keyfile)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def _serve_http(port: int, der: bytes):
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "application/pkix-cert")
            self.send_header("Content-Length", str(len(der)))
            self.end_headers()
            self.wfile.write(der)

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main() -> int:
    aia_port = _free_port()
    tls_port = _free_port()
    rogue_port = _free_port()

    # --- a real three-tier PKI -------------------------------------------
    root_key, int_key, leaf_key = _key(), _key(), _key()
    root = _sign(_name("Test Root"), _name("Test Root"), root_key, root_key, ca=True)
    intermediate = _sign(_name("Test Intermediate"), root.subject, int_key, root_key, ca=True)
    aia_url = f"http://127.0.0.1:{aia_port}/intermediate.cer"
    leaf = _sign(_name("localhost"), intermediate.subject, leaf_key, int_key,
                 ca=False, aia=aia_url, san="localhost")

    # The server sends ONLY the leaf — exactly KNBS's misconfiguration.
    leaf_pem = TMP / "leaf.pem"
    leaf_pem.write_bytes(leaf.public_bytes(serialization.Encoding.PEM))
    leaf_key_pem = TMP / "leaf.key"
    leaf_key_pem.write_bytes(leaf_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    _serve_https(leaf_pem, leaf_key_pem, tls_port, b"the figure")
    _serve_http(aia_port, intermediate.public_bytes(serialization.Encoding.DER))

    # A trust store holding the ROOT only, which is the real-world situation:
    # the root is in certifi, the intermediate is missing.
    root_only = TMP / "root.pem"
    root_only.write_bytes(root.public_bytes(serialization.Encoding.PEM))

    url = f"https://localhost:{tls_port}/"

    # 1. The problem reproduces.
    try:
        requests.get(url, verify=str(root_only), timeout=10)
        check(False, "expected the incomplete chain to FAIL against the root alone")
    except requests.exceptions.SSLError:
        pass

    # 2. The AIA pointer is found and the intermediate is fetched.
    urls = tls_chain.ca_issuer_urls(leaf)
    check(urls == [aia_url], f"caIssuers should be read from the leaf, got {urls}")

    # 3. The completed bundle verifies the chain that was always valid.
    #    certifi is swapped for our root so the test is hermetic.
    original_where = tls_chain.certifi.where
    tls_chain.certifi.where = lambda: str(root_only)
    tls_chain._CACHE.clear()
    try:
        bundle = tls_chain.completed_bundle(url)
        check(bundle is not None, "the chain should have been completable")
        if bundle:
            r = requests.get(url, verify=bundle, timeout=10)
            check(r.status_code == 200, f"completed chain should fetch, got {r.status_code}")
            check(r.content == b"the figure", "the body should arrive intact")

        # 4. THE ONE THAT MATTERS. A self-signed impostor on another port must
        #    still be refused with the same bundle. Completing one chain must
        #    not become trusting anything.
        rogue_key = _key()
        rogue = _sign(_name("localhost"), _name("localhost"), rogue_key, rogue_key,
                      ca=False, san="localhost")
        rogue_pem = TMP / "rogue.pem"
        rogue_pem.write_bytes(rogue.public_bytes(serialization.Encoding.PEM))
        rogue_key_pem = TMP / "rogue.key"
        rogue_key_pem.write_bytes(rogue_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
        _serve_https(rogue_pem, rogue_key_pem, rogue_port, b"forged")
        try:
            requests.get(f"https://localhost:{rogue_port}/", verify=bundle, timeout=10)
            FAILURES.append(
                "A SELF-SIGNED CERTIFICATE WAS ACCEPTED. This module would publish "
                "unauthenticated figures as fact — worse than the problem it solves."
            )
        except requests.exceptions.SSLError:
            pass
    finally:
        tls_chain.certifi.where = original_where
        tls_chain._CACHE.clear()

    # 5. A host with no AIA pointer returns None rather than something unsafe.
    no_aia = _sign(_name("localhost"), _name("localhost"), _key(), root_key, ca=False)
    check(tls_chain.ca_issuer_urls(no_aia) == [],
          "a certificate without AIA must yield no issuer URLs")

    if FAILURES:
        for f in FAILURES:
            print(f"FAIL: {f}")
        return 1
    print("ok  chain completed for a valid leaf; self-signed certificate still rejected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
