#!/bin/sh
# Prepara la carpeta _site que publica Cloudflare (sin tests, reglas ni configuracion).
set -e
rm -rf _site
mkdir _site
for f in *; do
  case "$f" in
    _site|tests|node_modules|firestore.rules|firebase.json|wrangler.jsonc|build-site.sh|package.json|package-lock.json|README.md) ;;
    *) cp -R "$f" _site/ ;;
  esac
done
cp _headers _site/_headers
