#ifndef PATH_FINDER_CORE_H
#define PATH_FINDER_CORE_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Run the path-findeR pipeline.
 *
 * @param parser_id   Identifier to assign to the produced manifest.
 * @param pages_json  JSON array of [url, html] pairs, e.g. [["http://...", "<html>..."], ...]
 * @param config_json JSON object with config fields (see Config struct)
 * @return            Heap-allocated JSON string with the manifest, or NULL on error.
 *                    Caller must free with pfr_free().
 */
char* pfr_run(const char* parser_id, const char* pages_json, const char* config_json);

/**
 * Compute the structural shape of an HTML page. Returns a heap-allocated
 * JSON object: {"paths": [...], "marks": [...], "id": "a1b2c3d4"}.
 *
 *   paths:  depth-capped root-to-node tag paths.
 *   marks:  stable identifiers (#id, role=, aria-*=, stable classes).
 *   id:     8-char FNV-1a of the path set; tail of the bucket ID.
 *
 * Caller must free with pfr_free(). Returns NULL on error.
 */
char* pfr_shape(const char* html);

/**
 * Jaccard similarity |A ∩ B| / |A ∪ B| between two shape path sets. Inputs
 * are JSON arrays of strings (the "paths" field of a pfr_shape result).
 *
 * @return  Score in [0.0, 1.0], or a negative value on error
 *          (check pfr_last_error).
 */
double pfr_shape_jaccard(const char* a_json, const char* b_json);

/**
 * Routing-grade similarity: max(jaccard, overlap). Overlap coefficient is
 * |A ∩ B| / min(|A|, |B|), which stays high when one set is a near-subset
 * of the other — the typical case for two pages of the same template that
 * differ only by optional sections (reviews, recommendations).
 *
 * Inputs and return match pfr_shape_jaccard.
 */
double pfr_shape_similarity(const char* a_json, const char* b_json);

/**
 * Free a string returned by pfr_run or pfr_shape.
 */
void pfr_free(char* ptr);

/**
 * Get the last error message (thread-local).
 * Returns NULL if no error. Valid until the next pfr_run call on the same thread.
 */
const char* pfr_last_error(void);

#ifdef __cplusplus
}
#endif

#endif /* PATH_FINDER_CORE_H */
