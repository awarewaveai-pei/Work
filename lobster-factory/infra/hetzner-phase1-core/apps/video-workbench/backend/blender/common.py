# Card P5: shared helpers for the Blender job scripts (run by backend/blender.cjs as
#   blender -b --factory-startup --offline-mode --python-exit-code 1 --python <script> -- <workdir>/args.json).
# Every *Path / *Dir argument must resolve inside the job's workdir: a script never reads or writes elsewhere.
# Coordinates: the page and the scene docs use three.js / glTF axes (Y up); Blender is Z up. to_blender() converts.
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    with open(argv[0], encoding="utf-8") as f:
        a = json.load(f)
    work = os.path.realpath(a["workdir"])

    def check(key, value):
        if isinstance(value, str) and (key.endswith("Path") or key.endswith("Dir")):
            real = os.path.realpath(value)
            if real != work and not real.startswith(work + os.sep):
                fail("path outside the job directory: " + key)
        elif isinstance(value, dict):
            for k, v in value.items():
                check(k, v)
        elif isinstance(value, list):
            for v in value:
                check(key, v)

    for k, v in a.items():
        check(k, v)
    return a


def fail(message):
    """A reason the page can show (backend/blender.cjs reads the VWERROR line), then exit code 1."""
    print("VWERROR " + json.dumps(message), flush=True)  # ASCII escapes: the console code page is not UTF-8
    raise SystemExit(1)


def result(value):
    print("VWRESULT " + json.dumps(value), flush=True)


def progress(done, total):
    print("VWPROGRESS %d/%d" % (done, total), flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path):
    before = set(bpy.data.objects)
    if path.lower().endswith(".bvh"):
        # use_fps_scale: keys follow the file's Frame Time at the scene's fps (CMU BVH is 120 fps, the scene 24).
        bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", rotate_mode="NATIVE", update_scene_fps=False, update_scene_duration=False, use_fps_scale=True)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def export_glb(path, animations=False):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_skins=True,
        export_yup=True,
        export_animations=animations,
        export_animation_mode="ACTIVE_ACTIONS",
        export_force_sampling=True,
        export_apply=False,
    )


def armatures(objs=None):
    return [o for o in (objs if objs is not None else bpy.data.objects) if o.type == "ARMATURE"]


def to_blender(v):
    x, y, z = v
    return Vector((x, -z, y))


def from_blender(v):
    x, y, z = v
    return Vector((x, z, -y))


def r(v, n=4):
    return [round(float(c), n) for c in v]


def world_rot(arm, bone_name, posed):
    """World rotation of a bone: posed (current frame) or rest."""
    if posed:
        m = arm.matrix_world @ arm.pose.bones[bone_name].matrix
    else:
        m = arm.matrix_world @ arm.data.bones[bone_name].matrix_local
    return m.to_quaternion()


def delta(arm, bone_name):
    """Posed world rotation relative to rest: independent of how an importer orients the bone's local axes."""
    return world_rot(arm, bone_name, True) @ world_rot(arm, bone_name, False).inverted()


def angle(q1, q2):
    d = abs(q1.dot(q2))
    return math.degrees(2 * math.acos(min(1.0, d)))


def dump(frames=()):
    """JSON summary of what a skinned GLB carries: armature bones (names, parents, rest heads), per-vertex weights
    keyed by rounded vertex position (glTF may split or reorder vertices; the weights per position must survive),
    actions, and for each frame in frames the posed bone tails and rotation deltas."""
    out = {"armatures": [], "meshes": [], "actions": sorted(a.name for a in bpy.data.actions)}
    for arm in armatures():
        bones = [{"name": b.name, "parent": b.parent.name if b.parent else None, "head": r(arm.matrix_world @ b.head_local, 3)} for b in arm.data.bones]
        out["armatures"].append({"name": arm.name, "bones": sorted(bones, key=lambda b: b["name"])})
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        names = {g.index: g.name for g in ob.vertex_groups}
        weights = {}
        for v in ob.data.vertices:
            w = {names[g.group]: round(g.weight, 3) for g in v.groups if g.weight > 0.001}
            if w:
                total = sum(w.values())
                weights[",".join("%.3f" % c for c in ob.matrix_world @ v.co)] = {k: round(x / total, 2) for k, x in sorted(w.items())}
        mods = [m.object.name for m in ob.modifiers if m.type == "ARMATURE" and m.object]
        out["meshes"].append({"name": ob.name, "vertices": len(ob.data.vertices), "groups": sorted(names.values()), "armature": mods, "weights": weights})
    poses = {}
    scene = bpy.context.scene
    for f in frames:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        poses[str(f)] = {
            arm.name: {pb.name: {"tail": r(arm.matrix_world @ pb.tail, 3), "delta": r(delta(arm, pb.name), 4)} for pb in arm.pose.bones}
            for arm in armatures()
        }
    out["poses"] = poses
    return out


def bake_visual(arm, bones, frames):
    """Keys the visual (constraint-evaluated or directly set) pose of bones on each frame into the active action."""
    scene = bpy.context.scene
    for f in frames:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        mats = {name: arm.pose.bones[name].matrix.copy() for name in bones}
        for name in bones:
            pb = arm.pose.bones[name]
            pb.rotation_mode = "QUATERNION"
            pb.matrix_basis = arm.convert_space(pose_bone=pb, matrix=mats[name], from_space="POSE", to_space="LOCAL")
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)


def _depth(bone):
    n = 0
    while bone.parent:
        bone, n = bone.parent, n + 1
    return n


def retarget(dst, motion_path, bone_map, match_rest=False):
    """Bakes the motion of motion_path (BVH, or the action of a GLB) onto armature dst by bone_map {src: dst} and removes
    the motion's objects. Each mapped bone gets the source bone's world rotation change from its rest pose (delta) on
    top of its own rest: rest orientations of the two rigs may differ and only the motion carries over. match_rest (card
    S4b, rigs whose rest poses differ, e.g. CMU legs splayed 20 degrees vs a straight-legged model): each non-root bone
    first turns its rest direction onto the source bone's rest direction, so posed bones point where the source's point.
    The mapped root bone also takes the source root's translation from rest, scaled by the ratio of the two rigs' root heights.
    Returns {frames: [start, end], bones: [dst], source: {frame: {dst: delta}}}."""
    src_objs = import_model(motion_path)
    src_arms = armatures(src_objs)
    if not src_arms or not (src_arms[0].animation_data and src_arms[0].animation_data.action):
        fail("動作檔沒有骨架動畫")
    src = src_arms[0]
    pairs = [(s, d) for s, d in bone_map.items() if s in src.pose.bones and d in dst.pose.bones]
    if not pairs:
        fail("骨骼對照表沒有任何相符的骨骼名稱")
    pairs.sort(key=lambda p: _depth(dst.data.bones[p[1]]))
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
    # Reference standing position of the source root: its rest head, or -- when the rest root sits at the floor, as in
    # CMU BVH (root offset 0, height and place only in the channels) -- its head on the first frame.
    src_root_rest = src.matrix_world @ src.data.bones[root_src].head_local
    if abs(src_root_rest.z) <= 1e-6:
        scene.frame_set(start)
        bpy.context.view_layer.update()
        src_root_rest = src.matrix_world @ src.pose.bones[root_src].head
    dst_root_rest = dst.matrix_world @ dst.data.bones[root_dst].head_local
    scale = (dst_root_rest.z / src_root_rest.z) if abs(src_root_rest.z) > 1e-6 else 1.0
    align = {}
    for s, d in pairs[1:] if match_rest else []:
        src_dir = (src.matrix_world.to_3x3() @ (src.data.bones[s].tail_local - src.data.bones[s].head_local)).normalized()
        dst_dir = (dst.matrix_world.to_3x3() @ (dst.data.bones[d].tail_local - dst.data.bones[d].head_local)).normalized()
        align[d] = dst_dir.rotation_difference(src_dir)
    source = {}
    total = end - start + 1
    for f in range(start, end + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        deltas = {d: delta(src, s) for s, d in pairs}
        source[str(f)] = {d: r(q) for d, q in deltas.items()}
        for s, d in pairs:
            bone = dst.data.bones[d]
            rest_world = dst.matrix_world @ bone.matrix_local
            rot = (deltas[d] @ align.get(d, Quaternion()) @ rest_world.to_quaternion()).to_matrix().to_4x4()
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
        progress(f - start + 1, total)

    src_action, names = src.animation_data.action, [o.name for o in src_objs]
    for name in names:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    bpy.data.actions.remove(src_action)
    return {"frames": [start, end], "bones": [d for _, d in pairs], "source": source}
