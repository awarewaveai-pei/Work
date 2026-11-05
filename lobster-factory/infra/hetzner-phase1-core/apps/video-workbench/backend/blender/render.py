# Card P5.0 gate (d) / job "blender-render": render a 3D scene doc to an RGBA PNG sequence (Eevee, transparent film).
# backend/blender-jobs.cjs assembles the PNGs into an alpha MOV exactly like the compositor (P3).
# Args (positions in glTF / three.js axes, Y up): {workdir, framesDir, width, height, frameCount, fps: {num, den},
#   objects: [{modelPath, position, rotationY (deg), scale, pose?: {bone: [w,x,y,z]}, ik?: [{bone, chain, target}]}], camera: {fov (vertical deg), keys: [{frame, position,
#   target}]}, lights: [{type: point|sun|spot, position, intensity, color: "#rrggbb"}], ground: bool, engine?: eevee|cycles}.
# engine: eevee (default, needs a GPU to be fast) | cycles (CPU path tracer + OIDN denoise: hosts without a GPU, where
# Eevee runs through Mesa llvmpipe at ~80 s per 1080p frame, P6 H5).
# Frame k of the output (0-based) is scene frame k + 1: an imported glTF animation starts at frame 1.
# pose = each bone's world rotation change from rest (scene axes, from the viewer's poseDeltas), ik = Blender IK
# constraints toward world targets, evaluated on every frame. A posed model's own animation is switched off.
# Light power is a mapping from the viewer's intensity, not a physical match: the viewer labels itself 預覽近似.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Quaternion, Vector

import common

POWER = {"point": 120.0, "spot": 160.0, "sun": 2.0}


def colour(hex_value):
    h = (hex_value or "#ffffff").lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]


def eevee():
    items = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if name in items:
            return name
    common.fail("此 Blender 沒有 Eevee")


def linear(obj):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    fcurves = getattr(ad.action, "fcurves", None)
    if fcurves is None:  # 4.4+ slotted actions
        fcurves = [fc for layer in ad.action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"


def depth(bone):
    n = 0
    while bone.parent:
        bone, n = bone.parent, n + 1
    return n


def apply_pose(arm, pose, ik, scene):
    if arm.animation_data:
        arm.animation_data.action = None
    bpy.context.view_layer.update()
    names = sorted((n for n in pose if n in arm.pose.bones), key=lambda n: depth(arm.data.bones[n]))
    for name in names:
        w, x, y, z = pose[name]
        q = Quaternion((w, x, -z, y))  # glTF axes -> Blender axes, as to_blender()
        bone = arm.data.bones[name]
        rest_world = arm.matrix_world @ bone.matrix_local
        world = (q @ rest_world.to_quaternion()).to_matrix().to_4x4()
        parent = arm.pose.bones[name].parent
        if parent:
            rel = bone.parent.matrix_local.inverted() @ bone.matrix_local
            world.translation = (arm.matrix_world @ parent.matrix @ rel).translation
        else:
            world.translation = rest_world.translation
        arm.pose.bones[name].matrix = arm.matrix_world.inverted() @ world
        bpy.context.view_layer.update()
    for item in ik:
        if item.get("bone") not in arm.pose.bones:
            continue
        target = bpy.data.objects.new("IK_" + item["bone"], None)
        scene.collection.objects.link(target)
        target.location = common.to_blender(item["target"])
        c = arm.pose.bones[item["bone"]].constraints.new("IK")
        # The bone's head reaches the target and `chain` parent bones rotate (the viewer's CCD preview does the same);
        # Blender counts the bone itself in chain_count.
        c.target, c.chain_count, c.use_tail = target, max(1, min(8, int(item.get("chain", 2)))) + 1, False


def main():
    a = common.args()
    common.reset()
    scene = bpy.context.scene
    n = int(a["frameCount"])
    scene.frame_start, scene.frame_end = 1, n
    scene.render.fps, scene.render.fps_base = int(a["fps"]["num"]), int(a["fps"]["den"])
    scene.render.resolution_x, scene.render.resolution_y = int(a["width"]), int(a["height"])
    scene.render.resolution_percentage = 100
    if a.get("engine") == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    else:
        scene.render.engine = eevee()
        scene.eevee.taa_render_samples = 16
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("World")
    world.color = (0.05, 0.05, 0.05)
    scene.world = world

    rigs = []
    for item in a.get("objects", []):
        objs = common.import_model(item["modelPath"])
        holder = bpy.data.objects.new("holder", None)
        scene.collection.objects.link(holder)
        for ob in objs:
            if ob.parent is None:
                ob.parent = holder
        holder.location = common.to_blender(item.get("position", [0, 0, 0]))
        holder.rotation_euler = (0, 0, math.radians(float(item.get("rotationY", 0))))
        holder.scale = [float(item.get("scale", 1))] * 3
        bpy.context.view_layer.update()
        arms = common.armatures(objs)
        if arms and (item.get("pose") or item.get("ik")):
            apply_pose(arms[0], item.get("pose") or {}, item.get("ik") or [], scene)
        rigs.append(arms[0] if arms else None)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(float(a["camera"].get("fov", 40)))
    cam = bpy.data.objects.new("Camera", cam_data)
    target = bpy.data.objects.new("CameraTarget", None)
    scene.collection.objects.link(cam)
    scene.collection.objects.link(target)
    scene.camera = cam
    track = cam.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    for key in a["camera"]["keys"]:
        f = int(key["frame"]) + 1
        cam.location = common.to_blender(key["position"])
        target.location = common.to_blender(key["target"])
        cam.keyframe_insert("location", frame=f)
        target.keyframe_insert("location", frame=f)
    linear(cam)
    linear(target)

    for i, light in enumerate(a.get("lights", [])[:3]):
        kind = light.get("type", "point")
        data = bpy.data.lights.new("Light%d" % i, {"point": "POINT", "sun": "SUN", "spot": "SPOT"}[kind])
        data.color = colour(light.get("color"))
        data.energy = POWER[kind] * float(light.get("intensity", 1))
        ob = bpy.data.objects.new("Light%d" % i, data)
        scene.collection.objects.link(ob)
        ob.location = common.to_blender(light.get("position", [2, 3, 2]))
        if kind != "point":
            aim = ob.constraints.new("TRACK_TO")
            aim.target, aim.track_axis, aim.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"

    if a.get("ground"):
        bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))

    # Posed bone heads on the first frame, glTF axes: the gate compares them with the viewer's pose.
    scene.frame_set(1)
    bpy.context.view_layer.update()
    heads = [{pb.name: common.r(common.from_blender(arm.matrix_world @ pb.head), 4) for pb in arm.pose.bones} if arm else {} for arm in rigs]
    os.makedirs(a["framesDir"], exist_ok=True)
    for i in range(n):
        scene.frame_set(i + 1)
        scene.render.filepath = os.path.join(a["framesDir"], "%06d.png" % i)
        bpy.ops.render.render(write_still=True)
        common.progress(i + 1, n)
    common.result({"frames": n, "engine": scene.render.engine, "heads": heads})


main()
