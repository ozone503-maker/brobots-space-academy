"""Jeff knee-up kick overrides (skin.animOverrides). Thigh stays on its own side and
foreshortens toward the camera; shin hangs, then extends at the camera (front) or out (round)."""
import json, os, sys
TH = -3  # undo Jeff's 3 deg bind lean so the thigh reads vertical
def front():
    th = [{'t': 0}, {'t': 0.12, 'rot': TH, 'sy': 0.5, 'z': 3}, {'t': 0.18, 'rot': TH, 'sy': 0.24, 'z': 3}, {'t': 0.185, 'rot': TH, 'sy': 0.22, 'z': 3, 'alpha': 0}, {'t': 0.2, 'rot': TH, 'sy': 0.16, 'sx': 0.88, 'z': 3, 'alpha': 0},
          {'t': 0.3, 'rot': TH, 'sy': 0.12, 'sx': 0.9, 'z': 3, 'alpha': 0}, {'t': 0.42, 'rot': TH, 'sy': 0.12, 'sx': 0.9, 'z': 3, 'alpha': 0},
          {'t': 0.55, 'rot': TH, 'sy': 0.16, 'sx': 0.88, 'z': 3, 'alpha': 0}, {'t': 0.565, 'rot': TH, 'sy': 0.22, 'z': 3, 'alpha': 0}, {'t': 0.57, 'rot': TH, 'sy': 0.24, 'z': 3}, {'t': 0.66, 'rot': TH, 'sy': 0.5, 'z': 3}, {'t': 0.85}]
    sh = [{'t': 0}, {'t': 0.12, 'rot': -TH, 'sy': 0.96, 'z': 2}, {'t': 0.2, 'rot': -TH, 'sy': 0.94, 'sx': 1.05, 'z': 2},
          {'t': 0.22, 'rot': -TH, 'sy': 0.9, 'sx': 1.07, 'z': 2}, {'t': 0.225, 'rot': -TH, 'sy': 0.89, 'sx': 1.07, 'z': 13},
          {'t': 0.3, 'rot': -TH, 'sy': 0.55, 'sx': 1.16, 'z': 13}, {'t': 0.42, 'rot': -TH, 'sy': 0.55, 'sx': 1.16, 'z': 13},
          {'t': 0.495, 'rot': -TH, 'sy': 0.89, 'sx': 1.07, 'z': 13}, {'t': 0.5, 'rot': -TH, 'sy': 0.9, 'sx': 1.07, 'z': 2},
          {'t': 0.55, 'rot': -TH, 'sy': 0.94, 'sx': 1.05, 'z': 2}, {'t': 0.66, 'rot': -TH, 'sy': 0.96, 'z': 2}, {'t': 0.85}]
    bo = [{'t': 0}, {'t': 0.12, 'sx': 1.04, 'sy': 1.04, 'z': 1}, {'t': 0.22, 'sx': 1.1, 'sy': 1.1, 'z': 1},
          {'t': 0.225, 'sx': 1.1, 'sy': 1.1, 'z': 12}, {'t': 0.3, 'sx': 1.35, 'sy': 1.35, 'z': 12},
          {'t': 0.42, 'sx': 1.35, 'sy': 1.35, 'z': 12}, {'t': 0.495, 'sx': 1.1, 'sy': 1.1, 'z': 12},
          {'t': 0.5, 'sx': 1.1, 'sy': 1.1, 'z': 1}, {'t': 0.66, 'sx': 1.04, 'sy': 1.04, 'z': 1}, {'t': 0.85}]
    so = [{'t': 0, 'alpha': 0, 'z': 14}, {'t': 0.85, 'alpha': 0, 'z': 14}]
    pel = [{'t': 0}, {'t': 0.12, 'rot': 1.5}, {'t': 0.3, 'rot': 2}, {'t': 0.42, 'rot': 2}, {'t': 0.66, 'rot': 1.5}, {'t': 0.85}]
    return {'tracks': {'foot_L': [{'t': 0, 'fk': 1}, {'t': 0.85, 'fk': 1}], 'thigh_L': th, 'shin_L': sh, 'boot_L': bo, 'sole_L': so, 'pelvis': pel}}
def round_():
    th = [{'t': 0}, {'t': 0.1, 'rot': TH, 'sy': 0.6, 'z': 3}, {'t': 0.165, 'rot': TH, 'sy': 0.25, 'z': 3}, {'t': 0.17, 'rot': TH, 'sy': 0.23, 'z': 3, 'alpha': 0}, {'t': 0.18, 'rot': TH, 'sy': 0.2, 'sx': 0.88, 'z': 3, 'alpha': 0},
          {'t': 0.3, 'rot': TH + 4, 'sy': 0.16, 'sx': 0.9, 'z': 3, 'alpha': 0}, {'t': 0.45, 'rot': TH + 4, 'sy': 0.16, 'sx': 0.9, 'z': 3, 'alpha': 0},
          {'t': 0.58, 'rot': TH, 'sy': 0.2, 'sx': 0.88, 'z': 3, 'alpha': 0}, {'t': 0.59, 'rot': TH, 'sy': 0.23, 'z': 3, 'alpha': 0}, {'t': 0.595, 'rot': TH, 'sy': 0.25, 'z': 3}, {'t': 0.72, 'rot': TH, 'sy': 0.6, 'z': 3}, {'t': 0.95}]
    sh = [{'t': 0}, {'t': 0.1, 'rot': -TH, 'sy': 0.96, 'z': 2}, {'t': 0.18, 'rot': -TH, 'sy': 0.9, 'z': 2},
          {'t': 0.3, 'rot': 84, 'sy': 0.92, 'z': 2}, {'t': 0.45, 'rot': 84, 'sy': 0.92, 'z': 2},
          {'t': 0.58, 'rot': -TH, 'sy': 0.9, 'z': 2}, {'t': 0.72, 'rot': -TH, 'sy': 0.96, 'z': 2}, {'t': 0.95}]
    bo = [{'t': 0}, {'t': 0.1, 'z': 1}, {'t': 0.18, 'rot': 0, 'z': 1}, {'t': 0.3, 'rot': 70, 'z': 1},
          {'t': 0.45, 'rot': 70, 'z': 1}, {'t': 0.58, 'rot': 0, 'z': 1}, {'t': 0.95}]
    pel = [{'t': 0}, {'t': 0.15, 'rot': 2}, {'t': 0.3, 'rot': 4}, {'t': 0.45, 'rot': 4}, {'t': 0.6, 'rot': 2}, {'t': 0.95}]
    root = [{'t': 0}, {'t': 0.15, 'x': 10}, {'t': 0.3, 'x': 30, 'y': -6}, {'t': 0.45, 'x': 30, 'y': -6}, {'t': 0.6, 'x': 10}, {'t': 0.95}]
    return {'tracks': {'foot_L': [{'t': 0, 'fk': 1}, {'t': 0.95, 'fk': 1}], 'thigh_L': th, 'shin_L': sh, 'boot_L': bo, 'pelvis': pel, 'root': root}}
def overrides():
    return {'kick_front_L': front(), 'kick_round_L': round_()}
if __name__ == '__main__':
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'jeff', 'skin.json')
    s = json.load(open(p)); s['animOverrides'] = overrides(); json.dump(s, open(p, 'w'), indent=1); print('ok')
