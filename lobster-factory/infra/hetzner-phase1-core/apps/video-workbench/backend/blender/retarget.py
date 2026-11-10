# Card P5.0 gate (c) / job "blender-retarget": put a motion (BVH, or the action of a second GLB) on a character by a
# bone-name map, bake it into one action and export the character GLB with it.
# Each mapped bone gets the source bone's world rotation change from its rest pose (delta), applied on top of the
# target bone's own rest: rest orientations of the two rigs may differ (BVH bones vs glTF bones) and only the
# motion carries over. The mapped root bone also takes the source root's translation from rest, scaled by the
# ratio of the two rigs' root heights. Args: {workdir, characterPath, motionPath, boneMap: {src: dst}, outPath}.
# Result: {frames: [start, end], bones: [dst], source: {frame: {dst: delta}}} (the deltas the gate compares).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common


def main():
    a = common.args()
    common.reset()
    char_objs = common.import_model(a["characterPath"])
    arms = common.armatures(char_objs)
    if not arms:
        common.fail("角色檔沒有骨架")
    out = common.retarget(arms[0], a["motionPath"], a["boneMap"])
    common.export_glb(a["outPath"], animations=True)
    common.result(out)


main()
