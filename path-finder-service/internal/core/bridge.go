package core

/*
#cgo LDFLAGS: -L${SRCDIR}/../../../target/release -lpath_finder_core
#cgo linux LDFLAGS: -lm -ldl -lpthread
#cgo darwin LDFLAGS: -lm -ldl -lpthread
#cgo CFLAGS: -I${SRCDIR}/../../../path-finder-core/include
#include "path_finder_core.h"
#include <stdlib.h>
*/
import "C"
import (
	"encoding/json"
	"fmt"
	"unsafe"

	"github.com/user/path-finder-service/internal/config"
)

// pipelinePayload is the JSON envelope sent over the FFI. Pipeline knobs are
// embedded so they marshal flat; AI config nests under "ai".
type pipelinePayload struct {
	config.PipelineConfig
	AI config.AIConfig `json:"ai"`
}

// RunPipeline calls the Rust core via FFI. Pipeline + AI configs marshal
// straight from their config structs — no parallel DTOs.
func RunPipeline(parserID string, pages [][2]string, pipeline config.PipelineConfig, ai config.AIConfig) (json.RawMessage, error) {
	pagesJSON, err := json.Marshal(pages)
	if err != nil {
		return nil, fmt.Errorf("marshal pages: %w", err)
	}
	configJSON, err := json.Marshal(pipelinePayload{PipelineConfig: pipeline, AI: ai})
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}

	cParserID := C.CString(parserID)
	defer C.free(unsafe.Pointer(cParserID))
	cPages := C.CString(string(pagesJSON))
	defer C.free(unsafe.Pointer(cPages))
	cConfig := C.CString(string(configJSON))
	defer C.free(unsafe.Pointer(cConfig))

	result := C.pfr_run(cParserID, cPages, cConfig)
	if result == nil {
		if msg := C.pfr_last_error(); msg != nil {
			return nil, fmt.Errorf("pipeline: %s", C.GoString(msg))
		}
		return nil, fmt.Errorf("pipeline: unknown error")
	}
	defer C.pfr_free(result)
	return json.RawMessage(C.GoString(result)), nil
}

// Shape is a page's structural signature returned by pfr_shape.
//
//   Paths: depth-capped root-to-node tag paths.
//   Marks: stable identifiers (#id, role=, aria-*=, stable classes) — used
//          to tiebreak shape matches on div-soup sites.
//   ID:    8-char FNV-1a of the path set; tail of the bucket id.
type Shape struct {
	Paths []string `json:"paths"`
	Marks []string `json:"marks"`
	ID    string   `json:"id"`
}

// ComputeShape parses HTML in the Rust core and returns its structural shape.
// The feeder uses this to bucket pages by template.
func ComputeShape(htmlStr string) (Shape, error) {
	cHTML := C.CString(htmlStr)
	defer C.free(unsafe.Pointer(cHTML))

	result := C.pfr_shape(cHTML)
	if result == nil {
		if msg := C.pfr_last_error(); msg != nil {
			return Shape{}, fmt.Errorf("shape: %s", C.GoString(msg))
		}
		return Shape{}, fmt.Errorf("shape: unknown error")
	}
	defer C.pfr_free(result)

	var s Shape
	if err := json.Unmarshal([]byte(C.GoString(result)), &s); err != nil {
		return Shape{}, fmt.Errorf("shape decode: %w", err)
	}
	return s, nil
}

// ShapeJaccard returns the similarity (0.0 to 1.0) between two shape path
// sets. Negative results indicate an FFI/parse error.
func ShapeJaccard(a, b []string) (float64, error) {
	aJSON, err := json.Marshal(a)
	if err != nil {
		return 0, fmt.Errorf("marshal a: %w", err)
	}
	bJSON, err := json.Marshal(b)
	if err != nil {
		return 0, fmt.Errorf("marshal b: %w", err)
	}
	cA := C.CString(string(aJSON))
	defer C.free(unsafe.Pointer(cA))
	cB := C.CString(string(bJSON))
	defer C.free(unsafe.Pointer(cB))

	score := float64(C.pfr_shape_jaccard(cA, cB))
	if score < 0 {
		if msg := C.pfr_last_error(); msg != nil {
			return 0, fmt.Errorf("shape_jaccard: %s", C.GoString(msg))
		}
		return 0, fmt.Errorf("shape_jaccard: unknown error")
	}
	return score, nil
}
