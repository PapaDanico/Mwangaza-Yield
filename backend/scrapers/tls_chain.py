"""Complete a server's certificate chain instead of trusting it blindly.

THE PROBLEM THIS SOLVES, AND THE ONE IT MUST NOT CREATE
------------------------------------------------------
KNBS is the originator of the CPI this app shows, the publisher of Kenya's
quarterly GDP, and the keeper of the release calendar that would let every
expiry guard here stop firing on a hand-set date. It is also the one permitted
source the pipeline cannot read. Every URL fails with:

    CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate

That is not KNBS being unreachable and not our network. It is a server sending
its leaf certificate WITHOUT the intermediate that links it to a trusted root.
Browsers paper over this by fetching the missing issuer themselves; `requests`
does not, so the chain cannot be built and verification fails.

The tempting fix is `verify=False`. This project will not do that for financial
data, and the reason is worth stating plainly: it does not merely ignore this
one missing link, it accepts ANY certificate, including one presented by
whoever happens to be between us and Nairobi. The figure that arrives would be
unauthenticated, and it would be published as fact.

WHAT THIS DOES INSTEAD
----------------------
It fetches the missing intermediate and completes the chain, which is exactly
what a browser does:

  1. Read the leaf certificate. Reading is not trusting — the connection used
     to fetch it verifies nothing and is used for nothing else.
  2. Take the caIssuers URL out of its Authority Information Access extension.
     That pointer is put there by the issuing CA precisely so a client can find
     the missing link.
  3. Download that intermediate and append it to the normal CA bundle.
  4. Retry the real request with `verify=<completed bundle>`.

Step 4 is a FULL verification against a bundle that now contains the missing
piece. A forged certificate still fails, a wrong hostname still fails, an
expired certificate still fails. The only thing that changed is that a chain
which was always valid can now be assembled.

WHY IT IS SAFE TO FETCH THE INTERMEDIATE OVER PLAIN HTTP
--------------------------------------------------------
AIA URLs are usually http:, and that is by design rather than an oversight: a
certificate cannot be tampered with usefully in transit, because it is only
useful if it correctly signs the leaf and chains to a root we already trust. A
substituted intermediate fails the very verification it is fetched to enable.

The bundle is written to a temporary file and reused per host, so one extra
round trip is paid once rather than per request.
"""
import ssl
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import certifi
import requests
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding

# How long to wait for the leaf and the intermediate. Short: this runs only on
# the failure path, and a source that cannot answer twice is a source that is
# down rather than one with a chain problem.
TIMEOUT = 20

_CACHE: dict[str, str] = {}


def _leaf_certificate(host: str, port: int = 443) -> x509.Certificate | None:
    """The certificate the server presents, read without verifying it.

    An unverified context is correct here and only here: the goal is to READ
    what was sent so its issuer can be looked up. Nothing from this connection
    is trusted, and no data is fetched over it.
    """
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with ssl.create_connection((host, port), timeout=TIMEOUT) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as tls:
                der = tls.getpeercert(binary_form=True)
    except OSError:
        return None
    return x509.load_der_x509_certificate(der) if der else None


def ca_issuer_urls(cert: x509.Certificate) -> list[str]:
    """caIssuers pointers from the certificate's AIA extension, in order."""
    try:
        aia = cert.extensions.get_extension_for_class(
            x509.AuthorityInformationAccess
        ).value
    except x509.ExtensionNotFound:
        return []
    return [
        d.access_location.value
        for d in aia
        if d.access_method == x509.oid.AuthorityInformationAccessOID.CA_ISSUERS
        and isinstance(d.access_location, x509.UniformResourceIdentifier)
    ]


def _fetch_intermediate(url: str) -> bytes | None:
    """The issuer certificate as PEM, whichever encoding it was served in."""
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except requests.exceptions.RequestException:
        return None
    if resp.status_code != 200 or not resp.content:
        return None
    body = resp.content
    try:
        # Most CAs serve DER for AIA; some serve PEM.
        cert = (
            x509.load_pem_x509_certificate(body)
            if b"-----BEGIN CERTIFICATE-----" in body
            else x509.load_der_x509_certificate(body)
        )
    except ValueError:
        return None
    return cert.public_bytes(Encoding.PEM)


def completed_bundle(url: str) -> str | None:
    """A CA bundle with this host's missing intermediate added, or None.

    None means the chain could not be completed, and the caller should let the
    original SSL error stand. It must NOT fall back to an unverified request.
    """
    host = urlparse(url).hostname
    if not host:
        return None
    if host in _CACHE:
        return _CACHE[host]

    leaf = _leaf_certificate(host, urlparse(url).port or 443)
    if leaf is None:
        return None
    pem_chunks = []
    for issuer_url in ca_issuer_urls(leaf):
        pem = _fetch_intermediate(issuer_url)
        if pem:
            pem_chunks.append(pem)
    if not pem_chunks:
        return None

    bundle = Path(tempfile.gettempdir()) / f"ca-with-intermediate-{host}.pem"
    bundle.write_bytes(Path(certifi.where()).read_bytes() + b"\n" + b"\n".join(pem_chunks))
    _CACHE[host] = str(bundle)
    return str(bundle)


def get(url: str, **kwargs) -> requests.Response:
    """`requests.get`, retried once against a completed chain on SSL failure.

    Verification is never disabled. If the chain still cannot be built, the
    original SSLError is raised for the caller to report — a source we cannot
    authenticate is a source we do not publish.
    """
    kwargs.setdefault("timeout", TIMEOUT)
    try:
        return requests.get(url, **kwargs)
    except requests.exceptions.SSLError:
        bundle = completed_bundle(url)
        if not bundle:
            raise
        # verify=<path> is a FULL verification against the completed bundle.
        return requests.get(url, verify=bundle, **kwargs)
