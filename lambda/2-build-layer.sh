#!/bin/bash
set -eo pipefail
gradle -q packageLibs
mv ./build/distributions/java-magic-studio.zip ./build/java-magic-studio-lib.zip