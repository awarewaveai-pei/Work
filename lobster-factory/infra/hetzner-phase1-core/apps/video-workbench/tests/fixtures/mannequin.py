# tests/s4b-autorig.cjs: a free, locally made humanoid with no skeleton -- the kind of mesh image -> 3D returns.
# Capsules for head, torso, arms (A-pose, 20 degrees below horizontal), legs, merged into one watertight mesh by a
# voxel remesh, 1.75 units tall, facing -Y (glTF +Z). Run: blender -b --factory-startup --python mannequin.py -- <out.glb>
import math
import sys

import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def capsule(a, b, r):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=(b - a).length, location=(a + b) / 2)
    cyl = bpy.context.object
    cyl.rotation_mode = "QUATERNION"
    cyl.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(b - a)
    for p in (a, b):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p)


H = 1.75
drop = math.radians(20)
capsule((0, 0, 0.56 * H), (0, 0, 0.80 * H), 0.11 * H)  # torso
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.065 * H, location=(0, 0, 0.93 * H))  # head
capsule((0, 0, 0.82 * H), (0, 0, 0.88 * H), 0.03 * H)  # neck
for s in (1, -1):
    shoulder = Vector((s * 0.12 * H, 0, 0.81 * H))
    arm = Vector((s * math.cos(drop), 0, -math.sin(drop))) * 0.40 * H
    capsule(shoulder, shoulder + arm, 0.03 * H)
    hip = Vector((s * 0.06 * H, 0, 0.53 * H))
    capsule(hip, (s * 0.07 * H, 0, 0.05 * H), 0.045 * H)
    capsule((s * 0.07 * H, 0, 0.03 * H), (s * 0.07 * H, -0.12 * H, 0.03 * H), 0.03 * H)  # foot, toes forward (-Y)
objs = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
body = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
body.location.z -= min(v.co.z for v in body.data.vertices)
bpy.ops.object.transform_apply(location=True)
mod = body.modifiers.new("remesh", "REMESH")
mod.mode, mod.voxel_size = "VOXEL", 0.012
bpy.ops.object.modifier_apply(modifier="remesh")
body.name = "Mannequin"
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True)
print("MANNEQUIN %d" % len(body.data.vertices))
