# Card P5: import one GLB/BVH and print what it carries (common.dump): armature, bone hierarchy, skin weights,
# actions, and the posed bones on the requested frames. Optionally re-export it as GLB (gate (a) round trip).
# Args: {workdir, inPath, frames?: [int], outPath?}.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy

import common


def main():
    a = common.args()
    common.reset()
    objs = common.import_model(a["inPath"])
    arms = common.armatures(objs)
    if arms and arms[0].animation_data and arms[0].animation_data.action:
        start, end = arms[0].animation_data.action.frame_range
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(start), int(end)
    info = common.dump(a.get("frames", []))
    info["frameRange"] = [bpy.context.scene.frame_start, bpy.context.scene.frame_end]
    if a.get("outPath"):
        common.export_glb(a["outPath"], animations=True)
    common.result(info)


main()
