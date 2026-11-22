import json, struct

paths = [
    'public/models/npc/modular/armature/armature.glb',
    'public/models/npc/modular/outfits/outfit_suit.glb',
    'public/models/npc/modular/outfits/outfit_arthur.glb',
    'public/models/npc/modular/heads/arthur_head.glb',
    'public/models/npc/modular/heads/cowboy_head.glb',
    'public/models/npc/modular/bodies/body_hands.glb',
]

def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack('<4sII', data[:12])
    chunk_len, chunk_type = struct.unpack('<II', data[12:20])
    gltf = json.loads(data[20:20+chunk_len].decode('utf-8'))
    bin_offset = 20 + chunk_len
    if bin_offset + 8 <= len(data):
        b_len, b_type = struct.unpack('<II', data[bin_offset:bin_offset+8])
        bin_data = data[bin_offset+8:bin_offset+8+b_len]
    else:
        bin_data = b''
    return gltf, bin_data

first_ibm = None
for path in paths:
    gltf, bin_data = read_glb(path)
    skins = gltf.get('skins', [])
    if not skins:
        print(f'{path}: NO SKIN')
        continue
    ibm_idx = skins[0].get('inverseBindMatrices')
    acc = gltf['accessors'][ibm_idx]
    bv_idx = acc.get('bufferView')
    bv = gltf['bufferViews'][bv_idx]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    # Read first 3 matrices (16 floats each)
    floats = struct.unpack_from(f'<{min(count,3)*16}f', bin_data, offset)
    mats = [floats[i*16:(i+1)*16] for i in range(min(count,3))]
    summary = tuple(round(v, 4) for v in mats[0])  # first matrix
    if first_ibm is None:
        first_ibm = summary
        match = 'REFERENCE'
    elif summary == first_ibm:
        match = 'MATCH'
    else:
        match = f'MISMATCH! diff at indices: {[i for i,v in enumerate(summary) if v != first_ibm[i]]}'
    print(f'{path.split("/")[-1]:25} IBM count={count} first_mat_hash={hash(summary)} {match}')
