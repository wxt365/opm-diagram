#!/usr/bin/env bash

set -euo pipefail

storage_root="/private/tmp/opm-diagram-e2e-runtime"
java_bin="${OPM_E2E_JAVA:-}"
runtime_jar="services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar"
maven_settings="${OPM_E2E_MAVEN_SETTINGS:-/private/tmp/opm-diagram-maven-central.xml}"
maven_repository="${OPM_E2E_MAVEN_REPOSITORY:-/private/tmp/opm-diagram-m2}"

if [[ -z "$java_bin" ]]; then
  shopt -s nullglob
  candidates=(
    "$HOME"/Library/Java/JavaVirtualMachines/*21*/Contents/Home/bin/java
    /Library/Java/JavaVirtualMachines/*21*/Contents/Home/bin/java
  )
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      java_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$java_bin" || ! -x "$java_bin" ]]; then
  echo "未找到 Java 21。请通过 OPM_E2E_JAVA 指定 Java 21 可执行文件。" >&2
  exit 1
fi

java_home="$(cd "$(dirname "$java_bin")/.." && pwd)"
rm -rf "$storage_root"

if [[ ! -f "$runtime_jar" ]] || find services/local-runtime/src/main docs/contracts/migrations/sqlite -type f -newer "$runtime_jar" -print -quit | grep -q .; then
  JAVA_HOME="$java_home" PATH="$java_home/bin:$PATH" ./mvnw -s "$maven_settings" -Dmaven.repo.local="$maven_repository" -pl services/local-runtime -am package -DskipTests
fi

exec "$java_bin" -jar "$runtime_jar" \
  --server.port=17851 \
  --opm.storage.root="$storage_root"
