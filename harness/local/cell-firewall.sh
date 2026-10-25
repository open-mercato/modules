#!/usr/bin/env bash
# cell-firewall.sh: network rules for one preview cell (harness/local/run-cell.sh, review round 2).
#
#   cell-firewall.sh add <chain> <subnet> [<host IPv4>...]
#   cell-firewall.sh del <chain> <subnet>
#   cell-firewall.sh list
#
# Runs in a throwaway container of the `fw` stage of harness/local/Dockerfile with `--net host --cap-add NET_ADMIN`
# (the script comes in on stdin, nothing of the host is mounted). The cell's bridge network may reach the internet
# (npm, GitHub) and nothing else:
# - FORWARD (chain DOCKER-USER, which Docker evaluates first): from the cell subnet to link-local (the cloud metadata
#   service 169.254.169.254), private, shared, loopback and multicast ranges and to every IPv4 of the host: REJECT.
#   Traffic inside the cell's own subnet returns first. Published ports of other containers are DNATed to private
#   addresses before FORWARD, so they are covered too.
# - INPUT: from the cell subnet to the host itself (any port, any address of the host): REJECT.
# Rules are applied to every iptables backend (nft, legacy) that has the DOCKER-USER chain; with none the script fails,
# so a cell never starts without them. All rules carry the comment <chain> and are removed by `del`.
set -euo pipefail

action=${1:-}
REJECT=(-j REJECT --reject-with icmp-admin-prohibited)
DENY=(169.254.0.0/16 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 127.0.0.0/8 224.0.0.0/4 0.0.0.0/8)
IPV4_RE='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
CIDR_RE='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'

backends() {
  local b found=0
  for b in iptables-nft iptables-legacy; do
    if command -v "$b" >/dev/null 2>&1 && "$b" -w -n -L DOCKER-USER >/dev/null 2>&1; then
      echo "$b"
      found=1
    fi
  done
  [[ "$found" == 1 ]] || { echo "cell-firewall: no iptables backend with a DOCKER-USER chain" >&2; return 3; }
}

case "$action" in
add | del)
  chain=${2:-}
  subnet=${3:-}
  [[ "$chain" =~ ^OMC-[a-f0-9]{6}$ ]] || { echo "cell-firewall: bad chain $chain" >&2; exit 64; }
  [[ "$subnet" =~ $CIDR_RE ]] || { echo "cell-firewall: bad subnet $subnet" >&2; exit 64; }
  shift 3
  mapfile -t ipts < <(backends)
  [[ ${#ipts[@]} -gt 0 ]] || exit 3
  for ipt in "${ipts[@]}"; do
    if [[ "$action" == add ]]; then
      "$ipt" -w -N "$chain"
      "$ipt" -w -A "$chain" -d "$subnet" -j RETURN
      for d in "${DENY[@]}"; do "$ipt" -w -A "$chain" -d "$d" "${REJECT[@]}"; done
      for h in "$@"; do
        [[ "$h" =~ $IPV4_RE ]] || { echo "cell-firewall: bad host address $h" >&2; exit 64; }
        "$ipt" -w -A "$chain" -d "$h/32" "${REJECT[@]}"
      done
      "$ipt" -w -I DOCKER-USER 1 -s "$subnet" -m comment --comment "$chain" -j "$chain"
      "$ipt" -w -I INPUT 1 -s "$subnet" -m comment --comment "$chain" "${REJECT[@]}"
      echo "cell-firewall: $ipt: $subnet -> internet only ($chain)"
    else
      while "$ipt" -w -D DOCKER-USER -s "$subnet" -m comment --comment "$chain" -j "$chain" 2>/dev/null; do :; done
      while "$ipt" -w -D INPUT -s "$subnet" -m comment --comment "$chain" "${REJECT[@]}" 2>/dev/null; do :; done
      "$ipt" -w -F "$chain" 2>/dev/null || true
      "$ipt" -w -X "$chain" 2>/dev/null || true
      if "$ipt" -w -S 2>/dev/null | grep -q -- "$chain"; then
        echo "cell-firewall: $ipt: rules of $chain left" >&2
        exit 1
      fi
      echo "cell-firewall: $ipt: $chain removed"
    fi
  done
  ;;
list)
  mapfile -t ipts < <(backends)
  for ipt in "${ipts[@]}"; do "$ipt" -w -S | grep -E 'OMC-[a-f0-9]{6}' | sed "s/^/$ipt: /" || true; done
  ;;
*)
  echo "usage: cell-firewall.sh add <chain> <subnet> [<host IPv4>...] | del <chain> <subnet> | list" >&2
  exit 64
  ;;
esac
