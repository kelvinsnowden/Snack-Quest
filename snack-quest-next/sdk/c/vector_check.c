/*
 * Prints the X-SQ-Signature for one test vector, so a test can compare it
 * with the vector's signatureHeader:
 *
 *   cc -o vector_check vector_check.c sq_sign.c -lcrypto
 *   ./vector_check SECRET METHOD PATH TIMESTAMP NONCE BODY_HEX
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sq_sign.h"

static int from_hex(const char *hex, unsigned char **out, size_t *len) {
  size_t n = strlen(hex);
  if (n % 2) return -1;
  *len = n / 2;
  *out = malloc(*len ? *len : 1);
  if (!*out) return -1;
  for (size_t i = 0; i < *len; i++) {
    unsigned int byte;
    if (sscanf(hex + 2 * i, "%2x", &byte) != 1) return -1;
    (*out)[i] = (unsigned char)byte;
  }
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 7) {
    fprintf(stderr, "usage: %s SECRET METHOD PATH TIMESTAMP NONCE BODY_HEX\n", argv[0]);
    return 2;
  }
  unsigned char *body;
  size_t body_len;
  if (from_hex(argv[6], &body, &body_len) != 0) {
    fprintf(stderr, "BODY_HEX is not hex\n");
    return 2;
  }
  char header[SQ_SIGNATURE_HEADER_LEN + 1];
  if (sq_sign(argv[1], argv[2], argv[3], argv[4], argv[5], body, body_len, header, sizeof header) != 0) {
    fprintf(stderr, "sq_sign failed\n");
    return 1;
  }
  free(body);
  printf("%s\n", header);
  return 0;
}
