#!/bin/bash

# fixup-dump.sh <FILENAME>

set -e

TMP=$(tempfile)

# Resorts the messages and patches bug with channel in .data being set as undefined. Would not work if we'd have more than 1 channel in the dump
jq '(.data[] |= (to_entries | sort_by(.value.t) | from_entries)) | (.meta as $meta | .data |= (to_entries | map(if .key == "undefined" then {key: ($meta | .channels | keys | .[0]), value} else . end) | from_entries))' -c <"$1" >"$TMP"
cat "$TMP" >"$1"
rm "$TMP"
