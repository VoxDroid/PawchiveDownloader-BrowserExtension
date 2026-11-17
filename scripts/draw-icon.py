"""Hand-drawn, cartoon style Pawchive Downloader icon, rendered headless in Blender.

Usage: blender -b --factory-startup --python scripts/draw-icon.py -- <out.png> [size] [save.blend]
(or simply: pnpm icons, which renders every size)

Every outline is a brush-pen stroke: it swells and tapers, wobbles a little and
overshoots where it closes. Fills are flat and sit slightly off-register from
the ink, like a printed cartoon. Everything is flat geometry seen from above.
"""
import math
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "//doodle.png"
SIZE = int(argv[1]) if len(argv) > 1 else 1024
BLEND = argv[2] if len(argv) > 2 else None
# Small sizes get a bolder, simpler drawing, as an illustrator would redraw them.
SIMPLE = SIZE < 96
BOLD = 1.0 if SIZE >= 96 else 1.75 if SIZE >= 32 else 2.4

INK = "#2a2040"
PALETTE = {
    "fur": "#fff8ee",
    "fur_shade": "#e7dbf3",
    "bean": "#9d8cff",
    "bean_shade": "#7462ec",
    "shine": "#ffffff",
}
MISREGISTER = (0.012, -0.014)  # fills drift a little from the ink


# ---------------------------------------------------------------- helpers
def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb], 1.0)


_materials = {}


def flat(color):
    """Unlit material, so colors come out exactly as picked."""
    if color in _materials:
        return _materials[color]
    mat = bpy.data.materials.new(color)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = hex_rgba(color)
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    _materials[color] = mat
    return mat


def wobble(t, seed, octaves=((1.0, 1.0), (2.3, 0.5), (5.1, 0.22))):
    """Smooth pseudo-noise in about [-1, 1] for a parameter t."""
    total = sum(a for _, a in octaves)
    return sum(a * math.sin(t * f * 2 * math.pi + seed * (1.7 + f)) for f, a in octaves) / total


def mesh_object(name, verts, faces, color, z):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, y, z) for x, y in verts], [], faces)
    mesh.materials.append(flat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def fill(name, points, color, z, offset=MISREGISTER):
    """A flat, filled polygon (concave shapes are fine)."""
    ox, oy = offset
    verts = [(x + ox, y + oy) for x, y in points]
    return mesh_object(name, verts, [list(range(len(verts)))], color, z)


def stroke(name, points, width, z, color=INK, closed=False, seed=1.0, overshoot=0.06, taper=0.12, jitter=0.006, wiggle=0.28):
    """A brush-pen line along points: varying width, tapered ends, slight wobble."""
    pts = list(points)
    if closed:
        # Start somewhere arbitrary and run a little past the start, like a pen does.
        n = len(pts)
        start = int((seed * 7919) % n)
        extra = int(n * overshoot)
        pts = [pts[(start + i) % n] for i in range(n + extra + 1)]
    count = len(pts)
    # Cumulative length for an even width profile.
    lengths = [0.0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        lengths.append(lengths[-1] + math.hypot(x1 - x0, y1 - y0))
    total = lengths[-1] or 1.0
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, count - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / d, dx / d
        t = lengths[i] / total
        ends = min(t / taper, (1 - t) / taper, 1.0)
        ends = 0.18 + 0.82 * math.sin(min(ends, 1.0) * math.pi / 2)
        w = width * ends * (1 + wiggle * wobble(t * 2.2, seed))
        drift = jitter * wobble(t * 3.0, seed + 11)
        cx, cy = x + nx * drift, y + ny * drift
        left.append((cx + nx * w / 2, cy + ny * w / 2))
        right.append((cx - nx * w / 2, cy - ny * w / 2))
    verts = left + right
    faces = [(i, i + 1, count + i + 1, count + i) for i in range(count - 1)]
    obj = mesh_object(name, verts, faces, color, z)
    # Round the tips with tiny dots so tapered ends look inked, not cut.
    for k, (x, y) in enumerate((pts[0], pts[-1])):
        dot = circle(x, y, width * 0.09, 0.0, 12)
        mesh_object(f"{name}Tip{k}", dot, [list(range(len(dot)))], color, z)
    return obj


def circle(cx, cy, rx, ry=0.0, segments=96, rot=0.0, seed=None, rough=0.0, bumps=0, bump_size=0.0):
    """Ellipse outline, optionally hand-wobbled and with fluffy bumps."""
    ry = ry or rx
    pts = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        k = 1.0
        if seed is not None:
            k += rough * wobble(i / segments, seed, ((1, 1.0), (2, 0.6), (3, 0.3)))
        if bumps:
            k += bump_size * abs(math.sin(a * bumps / 2))
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        c, s = math.cos(rot), math.sin(rot)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def cubic(p0, p1, p2, p3, steps=24):
    for i in range(steps):
        t = i / steps
        u = 1 - t
        yield (
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        )


def main_bean(cx, cy, scale):
    """The heart-ish main pad, from the original SVG path, re-centred."""
    segs = [
        ((256, 236), (194, 236), (128, 302), (128, 364)),
        ((128, 364), (128, 402), (156, 424), (190, 424)),
        ((190, 424), (216, 424), (232, 412), (256, 412)),
        ((256, 412), (280, 412), (296, 424), (322, 424)),
        ((322, 424), (356, 424), (384, 402), (384, 364)),
        ((384, 364), (384, 302), (318, 236), (256, 236)),
    ]
    pts = []
    for seg in segs:
        pts.extend(cubic(*seg))
    # SVG pad spans roughly 128..384 x 236..424; centre it and flip y.
    return [(cx + (x - 256) / 256 * scale, cy - (y - 330) / 256 * scale) for x, y in pts]


# ------------------------------------------------------------------ scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = False
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = True
scene.render.filter_size = 1.2 if not SIMPLE else 0.85
scene.view_settings.view_transform = "Standard"

LINE = 0.034 * BOLD  # main ink width
z = [0.0]


def nz():
    z[0] += 0.001
    return z[0]


# Paw: fluffy palm, then toes over it, so their outlines separate the toes.
PALM = (0.0, -0.2)
palm = circle(*PALM, 0.5, 0.42, segments=160, seed=1.3, rough=0.02, bumps=11, bump_size=0.035)
fill("Palm", palm, PALETTE["fur"], nz())
# A soft shade on the lower right of the palm.
shade = circle(PALM[0] + 0.1, PALM[1] - 0.1, 0.4, 0.3, segments=96, rot=-0.3)
if not SIMPLE:
    fill("PalmShade", [(x, y) for x, y in shade], PALETTE["fur_shade"], nz(), offset=(0.0, 0.0))
fill("PalmTop", circle(PALM[0] - 0.05, PALM[1] + 0.04, 0.44, 0.36, segments=120, seed=1.3, rough=0.02), PALETTE["fur"], nz())
stroke("PalmInk", palm, LINE, nz(), closed=True, seed=2.7)

TOES = [(-0.48, 0.16, 0.5), (-0.18, 0.38, 0.15), (0.18, 0.38, -0.15), (0.48, 0.16, -0.5)]
for i, (tx, ty, rot) in enumerate(TOES):
    toe = circle(tx, ty, 0.17, 0.19, segments=96, rot=rot, seed=5 + i, rough=0.03, bumps=5, bump_size=0.03)
    fill(f"Toe{i}", toe, PALETTE["fur"], nz())
    stroke(f"ToeInk{i}", toe, LINE * 0.95, nz(), closed=True, seed=6.1 + i * 1.7)

# Jelly beans with a darker lower edge and a shine.
for i, (tx, ty, rot) in enumerate(TOES):
    bean = circle(tx, ty - 0.015, 0.09, 0.105, segments=72, rot=rot, seed=9 + i, rough=0.04)
    fill(f"Bean{i}", bean, PALETTE["bean"], nz())
    if not SIMPLE:
        fill(f"BeanShine{i}", circle(tx - 0.03, ty + 0.035, 0.025, 0.017, segments=24, rot=0.6), PALETTE["shine"], nz(), offset=(0, 0))
    stroke(f"BeanInk{i}", bean, LINE * 0.7, nz(), closed=True, seed=12.3 + i)

big = main_bean(0.0, -0.25, 0.66)
if not SIMPLE:
    fill("MainBeanShade", [(x + 0.012, y - 0.008) for x, y in big], PALETTE["bean_shade"], nz())
fill("MainBean", [(x - 0.008, y + 0.01) for x, y in big], PALETTE["bean"], nz())
if not SIMPLE:
    fill("MainShine", circle(-0.17, -0.16, 0.04, 0.022, segments=32, rot=0.6), PALETTE["shine"], nz(), offset=(0, 0))
stroke("MainBeanInk", big, LINE * 0.85, nz(), closed=True, seed=15.5)

# The download arrow, inked into the big bean.
def chaikin(points, rounds=3):
    """Rounds the corners of a closed polygon, like a marker would."""
    for _ in range(rounds):
        out = []
        for i in range(len(points)):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % len(points)]
            out += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1), (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        points = out
    return points


def densify(points, step=0.01):
    out = []
    for i in range(len(points)):
        (x0, y0), (x1, y1) = points[i], points[(i + 1) % len(points)]
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n)]
    return out


# A chubby cartoon arrow, filled and inked, slightly tilted like a doodle.
AX, AY, TILT = 0.0, -0.245, math.radians(-4)
arrow = [(-0.058, 0.165), (0.058, 0.165), (0.058, 0.02), (0.155, 0.02), (0.0, -0.165), (-0.155, 0.02), (-0.058, 0.02)]
arrow = [(AX + x * math.cos(TILT) - y * math.sin(TILT), AY + x * math.sin(TILT) + y * math.cos(TILT)) for x, y in arrow]
arrow = densify(chaikin(densify(arrow, 0.03), 1), 0.006)
fill("Arrow", arrow, PALETTE["fur"], nz())
stroke("ArrowInk", arrow, LINE * 0.8, nz(), closed=True, seed=21, overshoot=0.035, wiggle=0.18)

# Fur tufts and a couple of motion ticks.
for i, pts in enumerate(
    [
        [(0.33, -0.43), (0.37, -0.4), (0.4, -0.35)],
        [(0.27, -0.5), (0.31, -0.48)],

    ]
):
    if not SIMPLE:
        stroke(f"Tuft{i}", pts, LINE * 0.55, nz(), seed=30 + i, taper=0.4)

# ----------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 1.44
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = (0.0, -0.035, 5)
bpy.context.collection.objects.link(cam)
scene.camera = cam

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
