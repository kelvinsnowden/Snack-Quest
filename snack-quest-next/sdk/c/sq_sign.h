/*
 * Snack Quest Machine API v1 request signing, in portable C.
 *
 * sq_sign() builds the canonical string of specification section 3.2 and
 * writes the X-SQ-Signature header value ("v1=" + 64 lowercase hex
 * characters, NUL-terminated) into out.
 *
 * The only cryptography needed is SHA-256 and HMAC-SHA256. sq_sign.c uses
 * OpenSSL; on a controller with mbedTLS or wolfSSL, replace the two
 * functions marked "crypto backend" in sq_sign.c and keep everything else.
 * Whatever you change, check the result against every vector in
 * docs/machine-api/signing-test-vectors.json (vector_check.c does that).
 */
#ifndef SQ_SIGN_H
#define SQ_SIGN_H

#include <stddef.h>

#define SQ_SIGNATURE_HEADER_LEN 67 /* "v1=" + 64 hex characters, without the NUL */

/*
 * method:          HTTP method; uppercased before signing ("post" signs as "POST").
 * path_with_query: exactly as sent, starting with /api/v1/..., including any ?query.
 * timestamp:       the X-SQ-Timestamp value, Unix seconds, as decimal text.
 * nonce:           the X-SQ-Nonce value (16-64 characters of [A-Za-z0-9_-]).
 * body, body_len:  the exact bytes sent; NULL/0 for an empty body.
 * out, out_size:   receives the header value; out_size must be > SQ_SIGNATURE_HEADER_LEN.
 *
 * Returns 0 on success, -1 on an invalid argument or a crypto failure.
 */
int sq_sign(const char *secret,
            const char *method,
            const char *path_with_query,
            const char *timestamp,
            const char *nonce,
            const unsigned char *body,
            size_t body_len,
            char *out,
            size_t out_size);

#endif
