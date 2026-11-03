# Card P5.0 gate (b): a test character built from nothing. Capsule body + a 2-bone arm in one mesh, an armature
# (root, spine, upper_arm.L, forearm.L, IK target hand_ik.L), automatic weights, the arm posed by an IK constraint
# towards target (glTF axes), the pose baked into an action (glTF has no constraints), exported as GLB.
# Args: {workdir, outPath, target: [x, y, z]}.  Result: {target, hand, weights: {group: vertices}}.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Vector

import common


def capsule(bm, a, b, radius, rings=10, segments=12):
    """Tube from a to b with hemispherical caps, rings along the length so the mesh can bend."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    side = axis.orthogonal().normalized()
    up = axis.cross(side)
    previous = None
    profile = []
    cap = 4
    for i in range(cap):
        t = math.pi / 2 * (1 - i / cap)
        profile.append((-math.sin(t) * radius, math.cos(t) * radius))
    for i in range(rings + 1):
        profile.append(((b - a).length * i / rings, radius))
    for i in range(1, cap):  # the tip itself is the single last vertex (a zero-radius ring breaks bone heat)
        t = math.pi / 2 * i / cap
        profile.append(((b - a).length + math.sin(t) * radius, math.cos(t) * radius))
    first = bm.verts.new(a + axis * profile[0][0])
    for along, rad in profile[1:]:
        ring = []
        for s in range(segments):
            ang = 2 * math.pi * s / segments
            ring.append(bm.verts.new(a + axis * along + (side * math.cos(ang) + up * math.sin(ang)) * rad))
        if previous is None:
            for s in range(segments):
                bm.faces.new((first, ring[s], ring[(s + 1) % segments]))
        else:
            for s in range(segments):
                bm.faces.new((previous[s], ring[s], ring[(s + 1) % segments], previous[(s + 1) % segments]))
        previous = ring
    last = bm.verts.new(b + axis * radius)
    for s in range(segments):
        bm.faces.new((previous[(s + 1) % segments], previous[s], last))


def main():
    a = common.args()
    common.reset()
    scene = bpy.context.scene
    mesh = bpy.data.meshes.new("Body")
    bm = bmesh.new()
    capsule(bm, (0, 0, 0.35), (0, 0, 1.35), 0.22)
    capsule(bm, (0.3, 0, 1.4), (1.05, 0, 1.4), 0.07, rings=16)  # clear of the body: bone heat fails on vertices inside another island
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # consistent outward winding: bone heat solves on it
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    body = bpy.data.objects.new("Body", mesh)
    scene.collection.objects.link(body)

    arm_data = bpy.data.armatures.new("Rig")
    arm = bpy.data.objects.new("Rig", arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, deform=True):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.parent = eb[parent] if parent else None
        b.use_deform = deform
        return b

    bone("root", (0, 0, 0.3), (0, 0, 0.9))
    bone("spine", (0, 0, 0.9), (0, 0, 1.5), "root").use_connect = True
    bone("upper_arm.L", (0.2, 0, 1.4), (0.62, 0.04, 1.4), "spine")  # slight forward bend: the IK bend direction
    bone("forearm.L", (0.62, 0.04, 1.4), (1.05, 0, 1.4), "upper_arm.L").use_connect = True
    bone("hand_ik.L", (1.05, 0, 1.4), (1.15, 0, 1.4), "root", deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    ik = arm.pose.bones["forearm.L"].constraints.new("IK")
    ik.target, ik.subtarget, ik.chain_count = arm, "hand_ik.L", 2
    target = common.to_blender(a["target"])
    rest = arm.matrix_world @ arm.data.bones["hand_ik.L"].head_local
    arm.pose.bones["hand_ik.L"].location = arm.data.bones["hand_ik.L"].matrix_local.to_3x3().inverted() @ (target - rest)
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions.new("pose")
    scene.frame_start = scene.frame_end = 1
    common.bake_visual(arm, ["root", "spine", "upper_arm.L", "forearm.L", "hand_ik.L"], [1])
    arm.pose.bones["forearm.L"].constraints.remove(ik)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    hand = arm.matrix_world @ arm.pose.bones["forearm.L"].tail

    counts = {}
    for g in body.vertex_groups:
        counts[g.name] = sum(1 for v in mesh.vertices for x in v.groups if x.group == g.index and x.weight > 0.01)
    common.export_glb(a["outPath"], animations=True)
    common.result({"target": common.r(target, 3), "hand": common.r(hand, 3), "weights": counts})


main()
