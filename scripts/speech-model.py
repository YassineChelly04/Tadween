"""Builds the dictation models shipped in src-tauri/resources/speech.

ar/: built here, as described below.
latin/: NVIDIA Canary 180m Flash (English, French, German, Spanish, CC BY 4.0),
the int8 export from sherpa-onnx, unpacked as it is. Measured on 120 FLEURS test
sentences per language, told the language, 4 CPU threads: French WER 9.6 %,
English WER 11.3 %, 5x real time. It adds 132 MB to the installer. Set aside for
size or speed: Parakeet TDT v3 (8.95 % / 8.26 %, 17x, 450 MB), Whisper Small
(15.0 % / 7.0 %, 2-3x, 193 MB), Whisper Base (French 31.1 %), a multi-language
FastConformer (12.6 % / 13.5 %, 30x, 100 MB).

Source: NVIDIA FastConformer Hybrid Large (ar, "pc": punctuation, no
diacritics), CC BY 4.0, transducer head exported to ONNX for sherpa-onnx.
The encoder's MatMul weights are quantised to uint8 (dynamic, ONNX Runtime);
decoder and joiner stay in float. Silero VAD comes from sherpa-onnx's release.

Measured on 150 FLEURS ar_eg test sentences (diacritics, tatweel and
punctuation removed; alef, ya and ta marbuta folded), sherpa-onnx 1.13.8,
4 CPU threads, modified beam search: WER 9.61 %, CER 5.82 %, 18x real time.

    py -3.11 -m venv .venv && .venv\\Scripts\\pip install onnx onnxruntime==1.31.0
    .venv\\Scripts\\python -I scripts/speech-model.py
"""
import hashlib
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src-tauri", "resources", "speech", "ar")
LATIN = os.path.join(ROOT, "src-tauri", "resources", "speech", "latin")
WORK = os.path.join(ROOT, "src-tauri", "target", "speech-model")

EXPORT = "https://huggingface.co/LukeJacob2023/sherpa-onnx-stt_ar_fastconformer_hybrid_large_pc/resolve/main/"
VAD = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"

SOURCES = {
    "encoder.onnx": (EXPORT + "encoder.onnx", None),
    "decoder.onnx": (EXPORT + "decoder.onnx", "e7f769b8db01c4258702787617a63d442e53dedbecee2cbf60b21f95a425bc73"),
    "joiner.onnx": (EXPORT + "joiner.onnx", "7be61877765d66e651e0691d992aae19f2c1ea6de28cb677aec6ad89084648ca"),
    "tokens.txt": (EXPORT + "tokens.txt", "b5d39b52143723e71d997ed5dd8a68aa5facbd0a7c84a47669f83b0033d33164"),
    "silero_vad.onnx": (VAD, "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"),
}
SHIPPED = {
    "encoder.int8.onnx": "6a70fe5cadcf303fef3651c53facc91c83630ae146182d617166edcc74201d22",
    "decoder.onnx": SOURCES["decoder.onnx"][1],
    "joiner.onnx": SOURCES["joiner.onnx"][1],
    "tokens.txt": SOURCES["tokens.txt"][1],
    "silero_vad.onnx": SOURCES["silero_vad.onnx"][1],
}

CANARY = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8.tar.bz2"
CANARY_ARCHIVE = "7a38ed8b13f014ad632b09ff8d22e0c6f1359dd046af9235d281dfae841b9ab9"
CANARY_FILES = {
    "encoder.int8.onnx": "7a75b4e2a5857a6dcc0819503bbe3fad66943db4a3ccf21d3f27c633667d303f",
    "decoder.int8.onnx": "e41a2ab9c0c2fe81a1e8ade5a45fb02a74bc4db7d1f91b89a54a25e2cf79cba2",
    "tokens.txt": "2dae6fc7815f9640645e0c765522b278ee0cef49b482d91f6913e334628d3e77",
}

LATIN_LICENSE = """Tadween dictation model, French and English

encoder.int8.onnx, decoder.int8.onnx, tokens.txt
  Derived from nvidia/canary-180m-flash
  (c) NVIDIA Corporation, licensed under CC BY 4.0:
  https://creativecommons.org/licenses/by/4.0/
  Changes: exported to ONNX and quantised to 8 bits by the sherpa-onnx project.
"""

LICENSE = """Tadween dictation model

encoder.int8.onnx, decoder.onnx, joiner.onnx, tokens.txt
  Derived from nvidia/stt_ar_fastconformer_hybrid_large_pc_v1.0
  (c) NVIDIA Corporation, licensed under CC BY 4.0:
  https://creativecommons.org/licenses/by/4.0/
  Changes: transducer head exported to ONNX for sherpa-onnx; encoder MatMul
  weights quantised to 8 bits.

silero_vad.onnx
  Silero VAD, (c) Silero Team, MIT licence: https://github.com/snakers4/silero-vad
"""


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(name, url):
    path = os.path.join(WORK, name)
    if not os.path.exists(path):
        print("downloading", name)
        urllib.request.urlretrieve(url, path + ".part")
        os.replace(path + ".part", path)
    return path


def build_latin():
    """Unpacks only the model files, and refuses anything not checksummed."""
    import tarfile

    os.makedirs(LATIN, exist_ok=True)
    archive = fetch("canary.tar.bz2", CANARY)
    if sha256(archive) != CANARY_ARCHIVE:
        sys.exit("canary.tar.bz2: checksum mismatch")
    with tarfile.open(archive, "r:bz2") as tar:
        for member in tar.getmembers():
            name = os.path.basename(member.name)
            if member.isfile() and name in CANARY_FILES and "test_wavs" not in member.name:
                with tar.extractfile(member) as src, open(os.path.join(LATIN, name), "wb") as dst:
                    for block in iter(lambda: src.read(1 << 20), b""):
                        dst.write(block)
    for name, digest in CANARY_FILES.items():
        if sha256(os.path.join(LATIN, name)) != digest:
            sys.exit(name + ": checksum mismatch")
    with open(os.path.join(LATIN, "LICENSE.txt"), "w", encoding="utf-8") as f:
        f.write(LATIN_LICENSE)


def main():
    from onnxruntime.quantization import QuantType, quantize_dynamic

    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for name, (url, digest) in SOURCES.items():
        path = fetch(name, url)
        if digest and sha256(path) != digest:
            sys.exit(f"{name}: checksum mismatch, refusing to continue")

    encoder = os.path.join(OUT, "encoder.int8.onnx")
    quantize_dynamic(os.path.join(WORK, "encoder.onnx"), encoder, weight_type=QuantType.QUInt8, op_types_to_quantize=["MatMul"])
    for name in ("decoder.onnx", "joiner.onnx", "tokens.txt", "silero_vad.onnx"):
        with open(os.path.join(WORK, name), "rb") as src, open(os.path.join(OUT, name), "wb") as dst:
            dst.write(src.read())
    with open(os.path.join(OUT, "LICENSE.txt"), "w", encoding="utf-8") as f:
        f.write(LICENSE)

    for name, digest in SHIPPED.items():
        actual = sha256(os.path.join(OUT, name))
        print(("ok  " if actual == digest else "DIFF"), name, actual)

    build_latin()


if __name__ == "__main__":
    main()
