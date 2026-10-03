#include "sq_sign.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

#include <openssl/evp.h>
#include <openssl/hmac.h>

/* ---- crypto backend: replace these two for mbedTLS / wolfSSL ---------- */

static int sq_sha256(const unsigned char *data, size_t len, unsigned char out[32]) {
  unsigned int written = 0;
  return EVP_Digest(data, len, out, &written, EVP_sha256(), NULL) == 1 && written == 32 ? 0 : -1;
}

static int sq_hmac_sha256(const unsigned char *key, size_t key_len, const unsigned char *data, size_t len, unsigned char out[32]) {
  unsigned int written = 0;
  return HMAC(EVP_sha256(), key, (int)key_len, data, len, out, &written) != NULL && written == 32 ? 0 : -1;
}

/* ----------------------------------------------------------------------- */

static void to_hex(const unsigned char *bytes, size_t len, char *out) {
  static const char digits[] = "0123456789abcdef";
  for (size_t i = 0; i < len; i++) {
    out[2 * i] = digits[bytes[i] >> 4];
    out[2 * i + 1] = digits[bytes[i] & 0x0f];
  }
  out[2 * len] = '\0';
}

int sq_sign(const char *secret, const char *method, const char *path_with_query, const char *timestamp, const char *nonce,
            const unsigned char *body, size_t body_len, char *out, size_t out_size) {
  if (!secret || !method || !path_with_query || !timestamp || !nonce || !out || out_size <= SQ_SIGNATURE_HEADER_LEN || (body_len > 0 && !body)) {
    return -1;
  }

  /* SHA-256 of the exact body bytes (the empty string for no body). */
  unsigned char body_hash[32];
  char body_hash_hex[65];
  if (sq_sha256(body_len ? body : (const unsigned char *)"", body_len, body_hash) != 0) {
    return -1;
  }
  to_hex(body_hash, sizeof body_hash, body_hash_hex);

  /* "v1\n{timestamp}\n{nonce}\n{METHOD}\n{path}\n{body hash}" — no trailing newline. */
  size_t method_len = strlen(method);
  size_t len = 3 + strlen(timestamp) + 1 + strlen(nonce) + 1 + method_len + 1 + strlen(path_with_query) + 1 + 64;
  char *canonical = malloc(len + 1);
  if (!canonical) {
    return -1;
  }
  char *p = canonical;
  memcpy(p, "v1\n", 3);
  p += 3;
  p += strlen(strcpy(p, timestamp));
  *p++ = '\n';
  p += strlen(strcpy(p, nonce));
  *p++ = '\n';
  for (size_t i = 0; i < method_len; i++) {
    *p++ = (char)toupper((unsigned char)method[i]);
  }
  *p++ = '\n';
  p += strlen(strcpy(p, path_with_query));
  *p++ = '\n';
  memcpy(p, body_hash_hex, 64);
  p += 64;
  *p = '\0';

  unsigned char mac[32];
  int result = sq_hmac_sha256((const unsigned char *)secret, strlen(secret), (const unsigned char *)canonical, (size_t)(p - canonical), mac);
  free(canonical);
  if (result != 0) {
    return -1;
  }
  memcpy(out, "v1=", 3);
  to_hex(mac, sizeof mac, out + 3);
  return 0;
}
