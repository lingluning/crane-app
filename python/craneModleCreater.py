"""
crane_generator_v5.py
実用的で美しい移動式クレーン 3D モデル
KATO CR-250 / TADANO TR-250 を参考にした写実的モデル

v4 からの主な改善:
  ✅ 4 つの大きな車輪 (8 つの小さなものではなく、2 軸)
  ✅ 前左に大きな運転席、前右にエンジン室
  ✅ 運転席の面取り (ベベル) で写実的
  ✅ 滑らかなテーパー伸縮ブーム (桁架ではない)
  ✅ 操作員キャビン (上部車体の上)
  ✅ 泥よけ、ステップ、バックミラー
  ✅ 赤いフックブロック (重量感あり)

実行:
  pip install trimesh numpy
  python crane_generator_v5.py
"""

import numpy as np
import trimesh
import trimesh.transformations as tf
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "models"
OUTPUT_DIR.mkdir(exist_ok=True)


# ================================================================
# 基本ユーティリティ
# ================================================================

def rgba(r, g, b, a=255):
    return [r, g, b, a]


def box(cx, cy, cz, sx, sy, sz, color, rotate_z=0):
    b = trimesh.creation.box(extents=[sx, sy, sz])
    if rotate_z != 0:
        b.apply_transform(tf.rotation_matrix(np.radians(rotate_z), [0, 0, 1]))
    b.apply_translation([cx, cy, cz])
    b.visual.face_colors = color
    return b


def beveled_box(cx, cy, cz, sx, sy, sz, color, bevel=0.2):
    """
    面取りのある箱 (八角柱形状)
    運転席など写実的に見せたい場所に使用
    """
    # 8 つの側面を持つ柱として構築
    # 上面・下面は八角形、側面は 8 つの台形
    bx = sx / 2 - bevel
    by = sy / 2
    bz = sz / 2 - bevel

    # 16 頂点
    bottom_verts = np.array([
        [-bx, -by, -sz/2], [bx, -by, -sz/2],
        [sx/2, -by, -bz], [sx/2, -by, bz],
        [bx, -by, sz/2], [-bx, -by, sz/2],
        [-sx/2, -by, bz], [-sx/2, -by, -bz],
    ])
    top_verts = bottom_verts.copy()
    top_verts[:, 1] = by

    all_verts = np.vstack([bottom_verts, top_verts])

    # 面の三角化
    faces = []

    # 底面 (8 角形を 6 三角形で)
    for i in range(6):
        faces.append([0, i + 1, i + 2])

    # 上面
    for i in range(6):
        faces.append([8, 8 + i + 2, 8 + i + 1])

    # 側面 (8 つの矩形を 2 三角形ずつで)
    for i in range(8):
        j = (i + 1) % 8
        faces.append([i, j, j + 8])
        faces.append([i, j + 8, i + 8])

    mesh = trimesh.Trimesh(vertices=all_verts, faces=faces)
    mesh.apply_translation([cx, cy, cz])
    mesh.visual.face_colors = color
    return mesh


def cylinder_z(cx, cy, cz, radius, width, color, sections=24):
    """Z 軸方向の円柱 - 車輪用"""
    c = trimesh.creation.cylinder(radius=radius, height=width, sections=sections)
    # trimesh の cylinder は Z 軸デフォルトなので、回転不要
    c.apply_translation([cx, cy, cz])
    c.visual.face_colors = color
    return c


def cylinder_y(cx, cy, cz, radius, height, color, sections=20):
    """Y 軸方向の円柱 - 垂直 (排気管、旋回台など)"""
    c = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    c.apply_transform(tf.rotation_matrix(np.radians(90), [1, 0, 0]))
    c.apply_translation([cx, cy, cz])
    c.visual.face_colors = color
    return c


def cylinder_x(cx, cy, cz, radius, length, color, sections=20):
    """X 軸方向の円柱 - ヘッドライト、ハンドルなど"""
    c = trimesh.creation.cylinder(radius=radius, height=length, sections=sections)
    c.apply_transform(tf.rotation_matrix(np.radians(90), [0, 1, 0]))
    c.apply_translation([cx, cy, cz])
    c.visual.face_colors = color
    return c


def tapered_beam(start, end, start_size, end_size, color, sections=4):
    """
    テーパーのある箱状梁 (ブームのセクション用)
    """
    start = np.array(start, dtype=float)
    end = np.array(end, dtype=float)
    direction = end - start
    length = np.linalg.norm(direction)

    if length < 1e-6:
        return None

    direction_norm = direction / length

    # 垂直な 2 軸を求める
    if abs(direction_norm[1]) < 0.99:
        up = np.array([0, 1, 0])
    else:
        up = np.array([1, 0, 0])
    right = np.cross(direction_norm, up)
    right = right / np.linalg.norm(right)
    up = np.cross(right, direction_norm)

    # セクション分割
    vertices = []
    for i in range(sections + 1):
        t = i / sections
        pt = start + t * direction
        size = start_size + t * (end_size - start_size)

        # 4 コーナー
        corners = [
            pt + up * size/2 + right * size/2,
            pt + up * size/2 - right * size/2,
            pt - up * size/2 - right * size/2,
            pt - up * size/2 + right * size/2,
        ]
        vertices.extend(corners)

    vertices = np.array(vertices)

    # 面
    faces = []
    # 側面 (4 面 × sections)
    for i in range(sections):
        for j in range(4):
            k = (j + 1) % 4
            v1 = i * 4 + j
            v2 = (i + 1) * 4 + j
            v3 = (i + 1) * 4 + k
            v4 = i * 4 + k
            faces.append([v1, v2, v3])
            faces.append([v1, v3, v4])

    # 前後の端面
    faces.append([0, 1, 2])
    faces.append([0, 2, 3])

    last = sections * 4
    faces.append([last, last + 2, last + 1])
    faces.append([last, last + 3, last + 2])

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
    mesh.visual.face_colors = color
    return mesh


def beam_between(p1, p2, thickness, color):
    """2 点間の細い梁 (シンプルな box で近似)"""
    p1 = np.array(p1, dtype=float)
    p2 = np.array(p2, dtype=float)
    vec = p2 - p1
    length = np.linalg.norm(vec)

    if length < 1e-6:
        return None

    # X 軸に沿った箱を作り、方向ベクトルへ回転
    b = trimesh.creation.box(extents=[length, thickness, thickness])

    direction = vec / length
    x_axis = np.array([1, 0, 0])
    rot_axis = np.cross(x_axis, direction)

    if np.linalg.norm(rot_axis) > 1e-6:
        rot_axis_norm = rot_axis / np.linalg.norm(rot_axis)
        angle = np.arccos(np.clip(np.dot(x_axis, direction), -1, 1))
        b.apply_transform(tf.rotation_matrix(angle, rot_axis_norm))

    b.apply_translation((p1 + p2) / 2)
    b.visual.face_colors = color
    return b


def annulus_ring(cx, cz, r_in, r_out, height, color, sections=64):
    """地面に置く赤い輪 (作業半径表示用)"""
    ring = trimesh.creation.annulus(
        r_min=r_in, r_max=r_out, height=height, sections=sections
    )
    ring.visual.face_colors = color
    ring.apply_transform(tf.rotation_matrix(np.radians(90), [1, 0, 0]))
    ring.apply_translation([cx, 0.02, cz])
    return ring


# ================================================================
# クレーン生成
# ================================================================

def create_crane_v5(
    boom_angle_deg=55,
    boom_length=12.0,
    swing_angle_deg=0,
    chassis_length=9.5,
    chassis_width=2.5,
    outrigger_span=3.8,
    cab_on_left=True,
    color_body=None,
    color_boom=None,
    color_accent=None,
    show_work_radius=True,
):
    """
    KATO CR-250 / TADANO TR-250 のような実用クレーンを生成
    """
    if color_body is None:
        color_body = rgba(255, 200, 0)
    if color_boom is None:
        color_boom = rgba(255, 205, 0)
    if color_accent is None:
        color_accent = rgba(210, 170, 0)

    dark = rgba(35, 35, 35)
    gray = rgba(120, 120, 120)
    glass = rgba(65, 95, 130)
    silver = rgba(190, 190, 190)

    parts = []
    L = chassis_length
    W = chassis_width

    # ================================================
    # 1. 大きな車輪 (4 つ、2 軸)
    # ================================================
    WHEEL_R = 0.70
    WHEEL_W = 0.45
    wheel_y = WHEEL_R
    wheel_z_pos = W / 2 + WHEEL_W / 2 - 0.05

    wheel_x = [-L * 0.30, L * 0.30]

    for wx in wheel_x:
        for wz_sign in [1, -1]:
            wz = wz_sign * wheel_z_pos
            # タイヤ (外側の黒)
            parts.append(cylinder_z(wx, wheel_y, wz, WHEEL_R, WHEEL_W, dark, sections=28))
            # ホイールリム (銀)
            parts.append(cylinder_z(wx, wheel_y, wz, WHEEL_R * 0.6, WHEEL_W * 1.02, silver, sections=20))
            # ハブキャップ (中心の黒)
            parts.append(cylinder_z(wx, wheel_y, wz, WHEEL_R * 0.2, WHEEL_W * 1.04, dark, sections=12))

    # ================================================
    # 2. シャーシ (オフロード用に少し高め)
    # ================================================
    chassis_bottom_y = WHEEL_R - 0.15
    chassis_height = 1.1
    chassis_center_y = chassis_bottom_y + chassis_height / 2
    chassis_top_y = chassis_bottom_y + chassis_height

    # メインシャーシ
    parts.append(box(0, chassis_center_y, 0, L, chassis_height, W, color_body))

    # 前バンパー
    parts.append(box(L / 2 + 0.25, chassis_center_y - 0.05, 0,
                     0.5, chassis_height * 0.8, W, dark))

    # 後バンパー
    parts.append(box(-L / 2 - 0.25, chassis_center_y - 0.05, 0,
                     0.5, chassis_height * 0.8, W, dark))

    # サイドステップ
    for z_side in [W / 2 + 0.05, -W / 2 - 0.05]:
        parts.append(box(0, chassis_bottom_y - 0.05, z_side,
                         L * 0.6, 0.08, 0.3, silver))

    # 泥よけ (車輪の上)
    for wx in wheel_x:
        for wz_sign in [1, -1]:
            wz = wz_sign * (W / 2 + 0.1)
            parts.append(box(wx, chassis_bottom_y - 0.15, wz,
                             WHEEL_R * 2.5, 0.25, 0.5, color_body))

    # ================================================
    # 3. 運転席 (大きく、前左、面取りあり)
    # ================================================
    cab_side_z = W / 4 if cab_on_left else -W / 4
    cab_x = -L * 0.25
    cab_y_bottom = chassis_top_y
    cab_height = 2.0
    cab_y_center = cab_y_bottom + cab_height / 2
    cab_length = L * 0.35
    cab_width = W * 0.45

    # メインキャビン (面取り付き)
    parts.append(beveled_box(cab_x, cab_y_center, cab_side_z,
                              cab_length, cab_height, cab_width,
                              color_body, bevel=0.15))

    # フロントガラス (大きく)
    parts.append(box(cab_x + cab_length / 2 + 0.02,
                     cab_y_center + 0.35, cab_side_z,
                     0.06, cab_height * 0.55, cab_width * 0.85, glass))

    # サイドウィンドウ (運転席外側)
    outer_z = W / 2 - 0.02 if cab_on_left else -W / 2 + 0.02
    parts.append(box(cab_x + 0.05, cab_y_center + 0.25, outer_z,
                     cab_length * 0.75, cab_height * 0.5, 0.05, glass))

    # 内側ウィンドウ
    inner_z = (cab_side_z - cab_width / 2 + 0.02) if cab_on_left else (cab_side_z + cab_width / 2 - 0.02)
    parts.append(box(cab_x - 0.1, cab_y_center + 0.25, inner_z,
                     cab_length * 0.6, cab_height * 0.45, 0.05, glass))

    # 屋根 (濃い色)
    parts.append(box(cab_x, cab_y_bottom + cab_height + 0.03, cab_side_z,
                     cab_length - 0.1, 0.08, cab_width - 0.1, color_accent))

    # ヘッドライト (4 つ、前面に)
    for yd_off in [-0.4, -0.8]:
        for zd_off in [0.3, -0.3]:
            parts.append(cylinder_x(
                cab_x + cab_length / 2 + 0.04,
                cab_y_center + yd_off,
                cab_side_z + zd_off,
                0.13, 0.12, rgba(255, 255, 220), sections=12
            ))

    # バックミラー
    parts.append(box(cab_x + cab_length / 2 - 0.3,
                     cab_y_center + 0.4,
                     outer_z + 0.15,
                     0.15, 0.3, 0.05, dark))

    # ================================================
    # 4. エンジン室 (運転席の反対側)
    # ================================================
    engine_side_z = -W / 4 if cab_on_left else W / 4
    engine_x = cab_x
    engine_width = W * 0.45
    engine_height = 1.5
    engine_y_center = cab_y_bottom + engine_height / 2

    parts.append(box(engine_x, engine_y_center, engine_side_z,
                     cab_length * 0.95, engine_height, engine_width,
                     color_body))

    # エンジングリル (通気口の横桟)
    for v in [-0.3, 0, 0.3]:
        parts.append(box(engine_x, engine_y_center + v,
                         engine_side_z + engine_width / 2 + 0.01,
                         cab_length * 0.7, 0.15, 0.02, dark))

    # ================================================
    # 5. 旋回台
    # ================================================
    turntable_x = L * 0.05
    turntable_y = chassis_top_y

    # ベースリング
    parts.append(cylinder_y(turntable_x, turntable_y + 0.1, 0,
                             1.1, 0.2, dark, sections=28))

    # 上リング
    parts.append(cylinder_y(turntable_x, turntable_y + 0.27, 0,
                             1.0, 0.15, color_accent, sections=28))

    # ================================================
    # 6. 上部車体 (クレーン本体ハウジング)
    # ================================================
    upper_x = turntable_x
    upper_y_bottom = turntable_y + 0.35
    upper_height = 1.6
    upper_y_center = upper_y_bottom + upper_height / 2
    upper_length = 4.5
    upper_width = W * 0.8

    # メインハウジング (若干の面取り)
    parts.append(beveled_box(upper_x, upper_y_center, 0,
                              upper_length, upper_height, upper_width,
                              color_body, bevel=0.1))

    # オペレーターキャビン (上部車体の上に小さい箱)
    op_cab_x = upper_x + upper_length * 0.35
    parts.append(box(op_cab_x, upper_y_bottom + upper_height + 0.15, 0,
                     1.0, 0.3, upper_width * 0.6, color_body))

    # オペレーターキャビンの窓
    parts.append(box(op_cab_x + 0.52, upper_y_bottom + upper_height + 0.15, 0,
                     0.04, 0.25, upper_width * 0.5, glass))

    # ================================================
    # 7. 配重 (上部車体の後ろ)
    # ================================================
    cw_x = upper_x - upper_length / 2 - 0.3
    cw_width = upper_width * 0.95
    cw_height = 1.3
    cw_y_center = upper_y_bottom + cw_height / 2

    parts.append(box(cw_x, cw_y_center, 0,
                     1.4, cw_height, cw_width, rgba(65, 65, 65)))

    # 配重の縞模様 (側面)
    for yd in [-0.3, 0, 0.3]:
        parts.append(box(cw_x - 0.7 - 0.01, cw_y_center + yd, 0,
                         0.02, 0.04, cw_width - 0.1, rgba(200, 200, 200)))

    # 配重の把手
    for side_z in [cw_width / 2 - 0.1, -cw_width / 2 + 0.1]:
        parts.append(cylinder_x(cw_x + 0.3, cw_y_center + 0.55, side_z,
                                 0.06, 0.3, rgba(140, 140, 140), sections=10))

    # ================================================
    # 8. テーパー伸縮ブーム (3 段)
    # ================================================
    boom_root_x = upper_x + upper_length / 2 - 0.2
    boom_root_y = upper_y_bottom + 0.6
    angle = np.radians(boom_angle_deg)

    total_length = boom_length

    # セクション 1 (根元 45%)
    sec1_len = total_length * 0.45
    sec1_start = np.array([boom_root_x, boom_root_y, 0])
    sec1_end = sec1_start + sec1_len * np.array([np.cos(angle), np.sin(angle), 0])
    sec1 = tapered_beam(sec1_start, sec1_end, 0.9, 0.72, color_boom)
    if sec1: parts.append(sec1)

    # セクション 2 (中 30%)
    sec2_len = total_length * 0.30
    sec2_start = sec1_end - 0.1 * np.array([np.cos(angle), np.sin(angle), 0])
    sec2_end = sec2_start + sec2_len * np.array([np.cos(angle), np.sin(angle), 0])
    sec2 = tapered_beam(sec2_start, sec2_end, 0.68, 0.54, color_accent)
    if sec2: parts.append(sec2)

    # セクション 3 (先端 25%)
    sec3_len = total_length * 0.25
    sec3_start = sec2_end - 0.08 * np.array([np.cos(angle), np.sin(angle), 0])
    sec3_end = sec3_start + sec3_len * np.array([np.cos(angle), np.sin(angle), 0])
    sec3 = tapered_beam(sec3_start, sec3_end, 0.52, 0.4, rgba(255, 100, 60))
    if sec3: parts.append(sec3)

    # ブーム先端の位置
    boom_tip = sec3_end

    # ブーム根元ピン
    parts.append(cylinder_z(boom_root_x, boom_root_y, 0,
                             0.35, 0.9, dark, sections=16))

    # ================================================
    # 9. 起臂油圧シリンダー
    # ================================================
    ram_root = np.array([boom_root_x - 0.5, upper_y_bottom + 0.1, 0])
    mid_t = 0.35
    mid_point = np.array([
        boom_root_x + total_length * mid_t * np.cos(angle),
        boom_root_y + total_length * mid_t * np.sin(angle),
        0
    ])
    perp = np.array([-np.sin(angle), np.cos(angle), 0])
    ram_tip = mid_point - perp * 0.45

    # シリンダー本体 (60%)
    ram_dir = ram_tip - ram_root
    ram_len = np.linalg.norm(ram_dir)
    body_end = ram_root + ram_dir * 0.6

    body = tapered_beam(ram_root, body_end, 0.28, 0.28, rgba(100, 100, 120))
    if body: parts.append(body)

    # ロッド (40%)
    rod = tapered_beam(body_end, ram_tip, 0.18, 0.18, silver)
    if rod: parts.append(rod)

    # ================================================
    # 10. ブーム先端シーブ
    # ================================================
    parts.append(cylinder_z(boom_tip[0], boom_tip[1], 0,
                             0.38, 0.65, rgba(55, 55, 55), sections=18))
    parts.append(cylinder_z(boom_tip[0], boom_tip[1], 0,
                             0.3, 0.18, rgba(180, 180, 180), sections=24))

    # ================================================
    # 11. ワイヤー + フック (垂直下降)
    # ================================================
    hook_y = 1.0
    hook_x = boom_tip[0]

    # ワイヤー (先端から垂直下)
    wire = tapered_beam(
        np.array([boom_tip[0], boom_tip[1], 0]),
        np.array([hook_x, hook_y + 0.35, 0]),
        0.06, 0.06, rgba(40, 40, 40), sections=1
    )
    if wire: parts.append(wire)

    # フックブロック (赤、重量感)
    parts.append(box(hook_x, hook_y + 0.1, 0, 0.5, 0.5, 0.45, rgba(140, 50, 50)))

    # フックピン (上部の銀)
    parts.append(cylinder_z(hook_x, hook_y + 0.3, 0, 0.08, 0.55, silver, sections=12))

    # フック本体
    parts.append(cylinder_y(hook_x, hook_y - 0.3, 0, 0.11, 0.4,
                             rgba(80, 80, 80), sections=14))

    # フック先端 (J 字の下部)
    parts.append(cylinder_x(hook_x + 0.15, hook_y - 0.48, 0, 0.1, 0.28,
                             rgba(80, 80, 80), sections=14))

    # ================================================
    # 12. 4 つのアウトリガー (H 型展開)
    # ================================================
    outrigger_x_pos = [L * 0.35, -L * 0.35]

    for ox in outrigger_x_pos:
        # H 型横桁
        parts.append(box(ox, chassis_bottom_y - 0.15, 0,
                         0.6, 0.5, outrigger_span * 2,
                         color_accent))

        for side_sign in [1, -1]:
            oz = side_sign * outrigger_span

            # 垂直脚
            leg_top_y = chassis_bottom_y - 0.15
            leg_bottom_y = 0.2
            leg_h = leg_top_y - leg_bottom_y
            leg_cy = (leg_top_y + leg_bottom_y) / 2

            parts.append(box(ox, leg_cy, oz, 0.45, leg_h, 0.45, color_accent))

            # 油圧シリンダー (脚に)
            parts.append(cylinder_y(ox + 0.1, leg_cy, oz + 0.1,
                                     0.08, leg_h * 0.8, silver, sections=10))

            # 敷板 (地面接地)
            parts.append(box(ox, 0.08, oz, 1.4, 0.15, 1.4,
                             rgba(170, 130, 60)))

            # 敷板の鋼板
            parts.append(box(ox, 0.17, oz, 1.2, 0.03, 1.2,
                             rgba(100, 100, 100)))

    # ================================================
    # 13. 作業半径表示の赤い輪
    # ================================================
    if show_work_radius:
        work_radius = total_length * np.cos(angle)
        ring = annulus_ring(turntable_x, 0,
                             work_radius - 0.12,
                             work_radius + 0.12,
                             0.03, rgba(255, 0, 0, 210))
        parts.append(ring)

    # ================================================
    # 結合して旋回を適用
    # ================================================
    combined = trimesh.util.concatenate(parts)

    if swing_angle_deg != 0:
        combined.apply_translation([-turntable_x, 0, 0])
        combined.apply_transform(tf.rotation_matrix(
            np.radians(swing_angle_deg), [0, 1, 0]
        ))
        combined.apply_translation([turntable_x, 0, 0])

    scene = trimesh.Scene()
    scene.add_geometry(combined, node_name="crane")

    return scene


# ================================================================
# 機種データベース
# ================================================================

CRANE_MODELS = {
    "TADANO_GR-250N": {
        "boom_angle_deg": 60,
        "boom_length": 12.0,
        "chassis_length": 9.5,
        "chassis_width": 2.5,
        "outrigger_span": 3.8,
        "color_body":   rgba(255, 200,   0),
        "color_accent": rgba(210, 170,   0),
        "color_boom":   rgba(255, 205,   0),
    },
    "KATO_CR-250RV": {
        "boom_angle_deg": 55,
        "boom_length": 12.5,
        "chassis_length": 9.5,
        "chassis_width": 2.5,
        "outrigger_span": 3.9,
        "color_body":   rgba(240, 145,  40),   # KATO 橙
        "color_accent": rgba(200, 115,  25),
        "color_boom":   rgba(245, 155,  50),
    },
    "KOBELCO_RK-250": {
        "boom_angle_deg": 65,
        "boom_length": 13.0,
        "chassis_length": 9.8,
        "chassis_width": 2.55,
        "outrigger_span": 4.0,
        "color_body":   rgba(255, 215,   0),
        "color_accent": rgba(200, 170,   0),
        "color_boom":   rgba(255, 220,   0),
    },
}


# ================================================================
# メイン実行
# ================================================================

if __name__ == "__main__":
    print(f"出力先: {OUTPUT_DIR}\n")

    for model_name, params in CRANE_MODELS.items():
        print(f"生成中: {model_name}")
        print(f"  ブーム角: {params['boom_angle_deg']}度, 長さ: {params['boom_length']} m")

        scene = create_crane_v5(**params)
        output_path = OUTPUT_DIR / f"crane_{model_name}.glb"
        scene.export(str(output_path))

        size_kb = output_path.stat().st_size / 1024
        print(f"  ✅ 完了: {output_path.name} ({size_kb:.1f} KB)\n")

    print(f"🎉 全 {len(CRANE_MODELS)} 機種の生成完了!")
    print(f"\n💡 gltf-viewer で確認:")
    print(f"   https://gltf-viewer.donmccurdy.com/")
    print(f"   → 生成された .glb ファイルをドラッグ＆ドロップ")