# Card S4b / job "blender-autorig": a humanoid skeleton for a model that has none (e.g. image -> 3D output).
# Model (all meshes joined, transforms applied) -> optional turn about the vertical axis so the arms lie along X and the
# figure faces -Y like the motions -> 15 joint points (landmarks; measured from the mesh unless given) -> Rigify "human"
# metarig without face, fingers, palm, breast, pelvis and heel bones, fitted to the joints, used as the deform skeleton
# (no Rigify control rig: glTF carries no constraints and the viewer does FK/IK itself) -> automatic weights; vertices
# bone heat cannot solve go through a voxel-remeshed copy, the rest take their two nearest bones -> optional motion
# through common.retarget -> GLB.
# Args: {workdir, modelPath, outPath, turn?: 0|90|180|270, landmarks?: {name: [x,y,z] glTF axes}, motionPath?, boneMap?}.
# Result: {turn, landmarks (glTF axes, after the turn), bones, weighted: [bone heat, via remeshed copy, nearest bones], frames?}.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import addon_utils
import bmesh
import bpy
from mathutils import Matrix, Vector

import common

LANDMARKS = ["pelvis", "neck", "head_top", "shoulder.L", "elbow.L", "wrist.L", "shoulder.R", "elbow.R", "wrist.R",
             "hip.L", "knee.L", "ankle.L", "hip.R", "knee.R", "ankle.R"]
KEEP = {"spine", "spine.001", "spine.002", "spine.003", "spine.004", "spine.005", "spine.006"} | {
    b + s for b in ("shoulder", "upper_arm", "forearm", "hand", "thigh", "shin", "foot", "toe") for s in (".L", ".R")}


def percentile(values, p):
    v = sorted(values)
    return v[min(len(v) - 1, max(0, int(round(p * (len(v) - 1)))))] if v else 0.0


def median(values):
    return percentile(values, 0.5)


def join_meshes(objs):
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        common.fail("模型檔沒有網格")
    if common.armatures(objs):
        common.fail("模型已有骨架：請用「動作重定向」")
    for o in objs:
        if o.type != "MESH":
            continue
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o != body:
            bpy.data.objects.remove(o, do_unlink=True)
    body.name = "Body"
    # Image -> 3D meshes split vertices along UV seams (S4b.2: SPAR3D 4350 open edges, bone heat solved 0 vertices);
    # welding coincident vertices closes them (UVs live on loops, so they survive) and lets bone heat work.
    h = max(body.dimensions) or 1.0
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4 * h)
    bm.to_mesh(body.data)
    bm.free()
    return body


def lateral_turn(verts, zmin, h):
    """0 or 90: the axis with the wider spread at chest-to-shoulder height is where the arms are."""
    band = [v for v in verts if zmin + 0.6 * h <= v.z <= zmin + 0.9 * h] or verts
    spread = lambda vals: percentile(vals, 0.98) - percentile(vals, 0.02)
    return 90 if spread([v.y for v in band]) > 1.15 * spread([v.x for v in band]) else 0


def measure(verts):
    """Joint points of a standing figure facing -Y with its left at +X (Blender axes), from the vertices and
    average human proportions (fractions of height from the feet). Approximate; the page lets the user correct them."""
    zmin = min(v.z for v in verts)
    h = max(v.z for v in verts) - zmin
    if h <= 0:
        common.fail("模型沒有高度")
    at = lambda f: zmin + f * h
    torso = [v for v in verts if at(0.4) <= v.z <= at(0.6)]
    x0, y0 = median([v.x for v in torso]), median([v.y for v in torso])
    p = {"pelvis": (x0, y0, at(0.55)), "neck": (x0, y0, at(0.84)), "head_top": (x0, median([v.y for v in verts if v.z >= at(0.9)]), at(1.0))}
    upper = [v for v in verts if at(0.45) <= v.z <= at(0.92)]
    for side, sign in (("L", 1), ("R", -1)):
        shoulder = Vector((x0 + sign * 0.12 * h, y0, at(0.82)))
        far = max(upper, key=lambda v: sign * (v.x - x0)) if upper else shoulder
        if sign * (far.x - x0) > 0.25 * h:  # arms out (T / A pose): shoulder -> fingertip = 0.44 h
            tip = Vector((far.x, far.y, far.z))
            elbow, wrist = shoulder.lerp(tip, 0.42), shoulder.lerp(tip, 0.75)
        else:  # arms down
            elbow, wrist = Vector((x0 + sign * 0.15 * h, y0, at(0.63))), Vector((x0 + sign * 0.16 * h, y0, at(0.485)))
        leg = [v for v in verts if at(0.05) <= v.z <= at(0.4) and sign * (v.x - x0) > 0.01 * h]
        lx = median([v.x for v in leg]) if leg else x0 + sign * 0.08 * h
        ly = median([v.y for v in leg]) if leg else y0
        p["shoulder." + side], p["elbow." + side], p["wrist." + side] = tuple(shoulder), tuple(elbow), tuple(wrist)
        p["hip." + side] = (x0 + (lx - x0) * 0.85, y0, at(0.53))
        p["knee." + side] = (lx, ly, at(0.285))
        p["ankle." + side] = (lx, ly, at(0.045))
    return {k: Vector(v) for k, v in p.items()}, h


def metarig():
    addon_utils.enable("rigify", default_set=True)
    before = set(bpy.data.objects)
    bpy.ops.object.armature_human_metarig_add()
    arm = bpy.context.view_layer.objects.active
    for o in set(bpy.data.objects) - before - {arm}:  # template extras (a widget mesh) must not reach the GLB
        bpy.data.objects.remove(o, do_unlink=True)
    arm.name = arm.data.name = "Rig"
    return arm


def fit(arm, j, h):
    """Moves the kept metarig bones onto the joints (Blender axes) and deletes the rest."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for b in list(eb):
        if b.name not in KEEP:
            eb.remove(b)
    for b in eb:
        b.use_connect = False
    pelvis, neck, top = j["pelvis"], j["neck"], j["head_top"]
    chest = pelvis.lerp(neck, 0.62)
    head = neck.lerp(top, 0.35)

    def put(name, a, b):
        eb[name].head, eb[name].tail = a, b

    put("spine", pelvis, pelvis.lerp(chest, 0.33))  # hips bone: root of the chain, points up
    put("spine.001", eb["spine"].tail.copy(), pelvis.lerp(chest, 0.66))
    put("spine.002", eb["spine.001"].tail.copy(), chest)
    put("spine.003", chest, neck)
    put("spine.004", neck, neck.lerp(head, 0.5))
    put("spine.005", neck.lerp(head, 0.5), head)
    put("spine.006", head, top)
    for s in ("L", "R"):
        sh, el, wr = j["shoulder." + s], j["elbow." + s], j["wrist." + s]
        put("shoulder." + s, chest.lerp(neck, 0.7) + (sh - neck) * 0.15, sh)
        put("upper_arm." + s, sh, el)
        put("forearm." + s, el, wr)
        put("hand." + s, wr, wr + (wr - el) * 0.6)
        hp, kn, an = j["hip." + s], j["knee." + s], j["ankle." + s]
        put("thigh." + s, hp, kn)
        put("shin." + s, kn, an)
        ball = an + Vector((0, -0.08 * h, -0.03 * h))  # forward (-Y) and down towards the floor
        put("foot." + s, an, ball)
        put("toe." + s, ball, ball + Vector((0, -0.05 * h, 0)))
    for name, parent in [("spine.001", "spine"), ("spine.002", "spine.001"), ("spine.003", "spine.002"), ("spine.004", "spine.003"),
                         ("spine.005", "spine.004"), ("spine.006", "spine.005"), ("upper_arm.L", "shoulder.L"), ("forearm.L", "upper_arm.L"),
                         ("hand.L", "forearm.L"), ("upper_arm.R", "shoulder.R"), ("forearm.R", "upper_arm.R"), ("hand.R", "forearm.R"),
                         ("shin.L", "thigh.L"), ("foot.L", "shin.L"), ("toe.L", "foot.L"), ("shin.R", "thigh.R"), ("foot.R", "shin.R"), ("toe.R", "foot.R")]:
        eb[name].parent = eb[parent]
    for name in ("shoulder.L", "shoulder.R"):
        eb[name].parent = eb["spine.003"]
    for name in ("thigh.L", "thigh.R"):
        eb[name].parent = eb["spine"]
    for b in eb:
        b.use_deform = True
    bpy.ops.armature.select_all(action="SELECT")
    bpy.ops.armature.calculate_roll(type="GLOBAL_POS_Z")
    bpy.ops.object.mode_set(mode="OBJECT")


def segment_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared)) if ab.length_squared > 0 else 0.0
    return (a + ab * t - p).length


def heat(obj, arm):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def weighted(v):
    return any(g.weight > 0.001 for g in v.groups)


def bind(body, arm, h):
    """Automatic (bone heat) weights on the model. When bone heat leaves more than 5% of it unweighted (image -> 3D meshes:
    S4b.2 SPAR3D solved 0 of 8606 vertices), the weights are solved on a voxel-remeshed copy (closed, one surface) and
    copied back by nearest-face interpolation. Any vertex still without a weight takes its two nearest bones (inverse
    square). Returns [vertices by bone heat, by the remeshed copy, by nearest bones]."""
    heat(body, arm)
    direct = sum(1 for v in body.data.vertices if weighted(v))
    copied = 0
    if direct < 0.95 * len(body.data.vertices):
        proxy = body.copy()
        proxy.data = body.data.copy()
        bpy.context.scene.collection.objects.link(proxy)
        proxy.parent = None
        proxy.matrix_world = body.matrix_world.copy()
        proxy.modifiers.clear()
        proxy.vertex_groups.clear()
        bpy.context.view_layer.objects.active = proxy
        bpy.ops.object.select_all(action="DESELECT")
        proxy.select_set(True)
        remesh = proxy.modifiers.new("remesh", "REMESH")
        remesh.mode, remesh.voxel_size = "VOXEL", h / 150
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        heat(proxy, arm)
        body.vertex_groups.clear()
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        dt = body.modifiers.new("weights", "DATA_TRANSFER")
        dt.object, dt.use_vert_data, dt.data_types_verts, dt.vert_mapping = proxy, True, {"VGROUP_WEIGHTS"}, "POLYINTERP_NEAREST"
        dt.layers_vgroup_select_src, dt.layers_vgroup_select_dst = "ALL", "NAME"
        bpy.ops.object.datalayout_transfer(modifier=dt.name)
        bpy.ops.object.modifier_move_to_index(modifier=dt.name, index=0)
        bpy.ops.object.modifier_apply(modifier=dt.name)
        bpy.data.objects.remove(proxy, do_unlink=True)
        copied = sum(1 for v in body.data.vertices if weighted(v))
        direct = 0
    segments = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform]
    groups = {g.name: g for g in body.vertex_groups}
    for name, _, _ in segments:
        if name not in groups:
            groups[name] = body.vertex_groups.new(name=name)
    nearest = 0
    for v in body.data.vertices:
        if weighted(v):
            continue
        co = body.matrix_world @ v.co
        d = sorted((segment_distance(co, a, b), n) for n, a, b in segments)[:2]
        w = [1 / max(x, 1e-6) ** 2 for x, _ in d]
        for (_, n), x in zip(d, w):
            groups[n].add([v.index], x / sum(w), "REPLACE")
        nearest += 1
    return [direct, copied, nearest]


def main():
    a = common.args()
    common.reset()
    body = join_meshes(common.import_model(a["modelPath"]))
    verts = [v.co.copy() for v in body.data.vertices]
    zmin, h = min(v.z for v in verts), max(v.z for v in verts) - min(v.z for v in verts)
    turn = a.get("turn")
    if turn is None:
        turn = lateral_turn(verts, zmin, h)
    if turn not in (0, 90, 180, 270):
        common.fail("轉向只能是 0、90、180、270 度")
    if turn:
        body.data.transform(Matrix.Rotation(math.radians(turn), 4, "Z"))
        body.data.update()
        verts = [v.co.copy() for v in body.data.vertices]
    given = a.get("landmarks")
    if given:
        if sorted(given) != sorted(LANDMARKS):
            common.fail("關節點不完整")
        joints = {k: common.to_blender(v) for k, v in given.items()}
    else:
        joints, h = measure(verts)
    arm = metarig()
    fit(arm, joints, h)
    weighted = bind(body, arm, h)
    out = {"turn": turn, "landmarks": {k: common.r(common.from_blender(joints[k]), 4) for k in LANDMARKS}, "bones": sorted(b.name for b in arm.data.bones), "weighted": weighted}
    if a.get("motionPath"):
        moved = common.retarget(arm, a["motionPath"], a["boneMap"], match_rest=True)
        out["frames"] = moved["frames"]
    common.export_glb(a["outPath"], animations=bool(a.get("motionPath")))
    common.result(out)


main()
