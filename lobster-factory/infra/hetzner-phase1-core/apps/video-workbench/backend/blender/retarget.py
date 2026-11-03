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
import bpy

import common


def depth(bone):
    n = 0
    while bone.parent:
        bone, n = bone.parent, n + 1
    return n


def main():
    a = common.args()
    common.reset()
    char_objs = common.import_model(a["characterPath"])
    arms = common.armatures(char_objs)
    if not arms:
        common.fail("角色檔沒有骨架")
    dst = arms[0]
    src_objs = common.import_model(a["motionPath"])
    src_arms = common.armatures(src_objs)
    if not src_arms or not (src_arms[0].animation_data and src_arms[0].animation_data.action):
        common.fail("動作檔沒有骨架動畫")
    src = src_arms[0]
    pairs = [(s, d) for s, d in a["boneMap"].items() if s in src.pose.bones and d in dst.pose.bones]
    if not pairs:
        common.fail("骨骼對照表沒有任何相符的骨骼名稱")
    pairs.sort(key=lambda p: depth(dst.data.bones[p[1]]))
    start, end = (int(round(x)) for x in src.animation_data.action.frame_range)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = start, end

    if dst.animation_data:
        dst.animation_data.action = None
    for action in list(bpy.data.actions):
        if action != src.animation_data.action:
            bpy.data.actions.remove(action)
    dst.animation_data_create()
    dst.animation_data.action = bpy.data.actions.new("retarget")
    for pb in dst.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis.identity()

    root_src, root_dst = pairs[0]
    src_root_rest = src.matrix_world @ src.data.bones[root_src].head_local
    dst_root_rest = dst.matrix_world @ dst.data.bones[root_dst].head_local
    scale = (dst_root_rest.z / src_root_rest.z) if abs(src_root_rest.z) > 1e-6 else 1.0
    source = {}
    total = end - start + 1
    for f in range(start, end + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        deltas = {d: common.delta(src, s) for s, d in pairs}
        source[str(f)] = {d: common.r(q) for d, q in deltas.items()}
        for s, d in pairs:
            bone = dst.data.bones[d]
            rest_world = dst.matrix_world @ bone.matrix_local
            rot = (deltas[d] @ rest_world.to_quaternion()).to_matrix().to_4x4()
            if d == root_dst:
                moved = (src.matrix_world @ src.pose.bones[s].head - src_root_rest) * scale
                head = rest_world.translation + moved
            else:
                parent = dst.pose.bones[d].parent
                # Keep the bone attached where its parent's posed matrix carries it.
                if parent:
                    rel = bone.parent.matrix_local.inverted() @ bone.matrix_local
                    head = (dst.matrix_world @ parent.matrix @ rel).translation
                else:
                    head = rest_world.translation
            world = rot.copy()
            world.translation = head
            dst.pose.bones[d].matrix = dst.matrix_world.inverted() @ world
            bpy.context.view_layer.update()
        for s, d in pairs:
            pb = dst.pose.bones[d]
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)
        common.progress(f - start + 1, total)

    src_action, names = src.animation_data.action, [o.name for o in src_objs]
    for name in names:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    bpy.data.actions.remove(src_action)
    common.export_glb(a["outPath"], animations=True)
    common.result({"frames": [start, end], "bones": [d for _, d in pairs], "source": source})


main()
