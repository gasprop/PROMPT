#!/usr/bin/env python3
"""Build stub libnss3/libnssutil3/libnspr4 shared objects so the headless
Chromium from @sparticuz/chromium can be loaded on a system without NSS/NSPR.
Only the 44 symbols the binary actually imports are provided; they return
failure/NULL so Chrome's NSS-dependent paths stay disabled."""
import re, subprocess, pathlib

SRC = pathlib.Path("/tmp/undef.txt")
OUT = pathlib.Path("/home/user/PROMPT/project/web/lib/stubs")
OUT.mkdir(parents=True, exist_ok=True)

syms = {}  # name -> version or None
for line in SRC.read_text().splitlines():
    m = re.search(r"undefined symbol: (\w+)(?:, version ([\w.]+))?", line)
    if m:
        syms[m.group(1)] = m.group(2)

nss = {}    # version -> [names]
nsutil = {}
nspr = []
for name, ver in sorted(syms.items()):
    if name.startswith("NSS_") and name != "NSS_SetAlgorithmPolicy":
        nss.setdefault(ver, []).append(name)
    elif name == "NSS_SetAlgorithmPolicy":
        nsutil.setdefault(ver, []).append(name)
    elif name.startswith("PR_"):
        nspr.append(name)
    else:
        nss.setdefault(ver, []).append(name)

def c_body(names):
    return "\n".join(f"void *{n}(void) {{ return 0; }}" for n in names)

def build(lib, groups, unversioned=()):
    cfile = OUT / f"{lib}.c"
    vfile = OUT / f"{lib}.map"
    allnames = [n for g in groups.values() for n in g] + list(unversioned)
    cfile.write_text("\n".join([
        "/* auto-generated stub */",
        c_body(allnames),
        "",
    ]))
    if groups:
        parts = []
        for ver, names in groups.items():
            parts.append(f"{ver} {{\n  global:\n" + "".join(f"    {n};\n" for n in names) + "};")
        vfile.write_text("\n".join(parts) + "\n")
        link = ["-Wl,--version-script," + str(vfile)]
    else:
        link = []
    cmd = ["gcc", "-shared", "-fPIC", "-O1", "-o", str(OUT / lib), str(cfile),
           "-Wl,-soname," + lib] + link
    subprocess.run(cmd, check=True)
    print("built", lib, len(allnames), "symbols")

build("libnss3.so", nss)
build("libnssutil3.so", nsutil)
build("libnspr4.so", {}, nspr)
print("done")
