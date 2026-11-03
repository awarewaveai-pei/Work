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
        bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", rotate_mode="NATIVE", update_scene_fps=False, update_scene_duration=False)
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
