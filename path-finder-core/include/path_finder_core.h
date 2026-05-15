#ifndef PATH_FINDER_CORE_H
#define PATH_FINDER_CORE_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Run the path-findeR pipeline.
 *
 * @param pages_json  JSON array of [url, html] pairs, e.g. [["http://...", "<html>..."], ...]
 * @param config_json JSON object with config fields (see Config struct)
 * @return            Heap-allocated JSON string with the manifest, or NULL on error.
 *                    Caller must free with pfr_free().
 */
char* pfr_run(const char* pages_json, const char* config_json);

/**
 * Free a string returned by pfr_run.
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
