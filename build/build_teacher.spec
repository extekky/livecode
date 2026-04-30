from pathlib import Path


ROOT = Path.cwd()
FRONTEND_DIST_DIR = ROOT / "frontend" / "dist"

if not FRONTEND_DIST_DIR.exists():
    raise SystemExit("frontend/dist is missing. Run `npm run build` in frontend/.")

datas = [(str(FRONTEND_DIST_DIR), "frontend/dist")]

hiddenimports = [
    "websockets.asyncio.server",
]


a = Analysis(
    ["start_teacher.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="liveshare-teacher",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
