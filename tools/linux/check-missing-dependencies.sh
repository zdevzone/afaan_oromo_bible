#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: $0 path/to/package.deb" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the isolated Ubuntu 24.04 dependency check" >&2
  exit 2
fi

package_path="$(realpath "$1")"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
cp "$package_path" "$temp_dir/package.deb"

docker run --rm --network none \
  --mount "type=bind,src=$temp_dir/package.deb,dst=/tmp/package.deb,readonly" \
  ubuntu:24.04 bash -euc '
    package_name="$(dpkg-deb -f /tmp/package.deb Package)"
    depends="$(dpkg-deb -f /tmp/package.deb Depends)"
    depends_compact="${depends// /}"
    case ",$depends_compact," in
      *,libwebkit2gtk-4.1-0,*) ;;
      *) echo "Missing required WebKitGTK runtime dependency in: $depends" >&2; exit 1 ;;
    esac
    case ",$depends_compact," in
      *,libgtk-3-0,*) ;;
      *) echo "Missing required GTK runtime dependency in: $depends" >&2; exit 1 ;;
    esac

    if dpkg-query -W -f="\${db:Status-Abbrev}" libwebkit2gtk-4.1-0 libgtk-3-0 2>/dev/null | grep -q "ii"; then
      echo "Ubuntu 24.04 dependency-check image unexpectedly has a GTK/WebKit runtime installed" >&2
      exit 1
    fi

    set +e
    dpkg -i /tmp/package.deb >/tmp/dpkg-install.log 2>&1
    install_status=$?
    set -e
    cat /tmp/dpkg-install.log
    test "$install_status" -ne 0
    grep -q "dependency problems prevent configuration" /tmp/dpkg-install.log
    grep -q "libwebkit2gtk-4.1-0 is not installed" /tmp/dpkg-install.log
    grep -q "libgtk-3-0 is not installed" /tmp/dpkg-install.log
    package_status="$(dpkg-query -s "$package_name" | sed -n "s/^Status: //p")"
    test "$package_status" = "install ok unpacked"
    echo "Expected: dpkg refused configuration and identified both missing runtime dependencies; package remains unpacked in this disposable container."
  '
