# Card S4b.2 evidence: one front and one three-quarter render per GLB (Workbench, textures shown), camera framed on the
# model's bounds. Run: blender -b --factory-startup --python thumbs.py -- <out_dir> <name>=<glb>@<yaw> ...
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
# <name>=<glb>@<yaw>: yaw turns the camera to the side the vendor's model faces (SPAR3D's output faces glTF -Z, TRELLIS's +Z).
out_dir, items = args[0], [(a.split("=", 1)[0], *a.split("=", 1)[1].rsplit("@", 1)) for a in args[1:]]
for name, glb, yaw in items:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = sc.render.resolution_y = 384
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.92, 0.92, 0.92)
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    for view, ang in (("front", 0), ("side", 45)):
        a = math.radians(ang + float(yaw))
        cam.location = center + Vector((math.sin(a), -math.cos(a), 0.25)) * size * 1.6
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(out_dir, f"{name}-{view}.png")
        bpy.ops.render.render(write_still=True)
