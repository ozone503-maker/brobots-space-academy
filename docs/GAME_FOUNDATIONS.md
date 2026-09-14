# Brobots Game Foundations (canonical)

**Locked:** 2026-09-14  
**License rule:** MIT-only foundations. **Never use HexGL** (commercial-restrictive).

This is the stack Brobots builds **on top of**. Prototype artifacts (React + Mapbox + Brobots HUD/missions) are the **skin and wiring template** — they do **not** reimplement flight physics or continuous terrain loading.

---

## Division of layers

| Layer | Owns | Does not own |
|-------|------|----------------|
| **Foundation (production)** | Vehicle physics, terrain streaming, hover dynamics | Brobots story, brand HUD, share flows |
| **Brobots layer (artifact → production skin)** | Vehicles/characters look, MDP wingman, HUD, briefings, missions, share/show-off, flight *loop* UX | Replicating RCForge/OSM/Hover Maze engines |

**Prototype contract:** When Jessie/Claude ships a UFO sim artifact (React + Mapbox satellite + Mystery Drone Pilot briefings/HUD), it **assumes** RCForge-class physics + OSM-class terrain underneath. Production work swaps Mapbox/demo stubs for real RCForge + OSM (and Hover Maze for speeder) while keeping the Brobots layer as the template for how it wires together.

---

## UFO flight simulator

### Best combination
- **Physics / vehicle / cameras / controls:** [RCForge](https://github.com/adithya-s-k/RCForge) — modern browser flight physics, VTOL, cockpit/chase cameras, gamepad, replay, configurable vehicles. **MIT.**
- **World beneath the craft:** [OSM Drone Simulator](https://github.com/OlivierB-OB/osm-drone-simulator) — continuously loading real terrain, elevation, buildings, roads, water, vegetation. **MIT.**

### Brobots layer (on top)
- Brobots UFO / craft skins  
- **Mystery Drone Pilot (MDP)** as wingman — briefings, callouts, HUD  
- Mission structure, show-off / share  
- Campus or Multimedia door into the sim  

### Optional add-ons
- **Combat / AI opponents / effects:** [Cel Thunder](https://github.com/PauliusOS/cel-thunder) — browser flight combat, AI enemies, procedural effects, multiplayer architecture. **MIT.** Use when missions need opponents — not required for v1 sightseeing/flight loop.
- **Heavier photoreal graphics:** [Photorealistic Flight Simulator](https://github.com/rlefko/flight-simulator) — procedural terrain, atmosphere, water, six-direction flight. **MIT**, heavier. Only if we need it later.

---

## Speeder bike (forest run)

### Foundation
- **Movement:** [Hover Maze](https://github.com/i-Madsen/Hover-Maze) — hover velocity, drifting, steering inertia, wall collisions, bouncing. **MIT.**  
- Rebuild with **modern hover-height raycasts** for forest canopy / ground follow.  
- Thumb-steer to navigate obstacles (mobile-first control).

### Brobots layer (on top)
- Speeder bike model / FlashTown–forest world dressing  
- HUD, missions, share  
- Same MIT attribution discipline  

---

## What we do not use

| Project | Why |
|---------|-----|
| **HexGL** | License restricts commercial use — **banned** for Brobots |

---

## Attribution (keep in repo README / CREDITS)

Ship a `CREDITS.md` (or README section) on every game package with at least:

```
Flight / VTOL foundation: RCForge — https://github.com/adithya-s-k/RCForge (MIT)
Terrain streaming: OSM Drone Simulator — https://github.com/OlivierB-OB/osm-drone-simulator (MIT)
Hover / speeder movement: Hover Maze — https://github.com/i-Madsen/Hover-Maze (MIT)
Optional combat: Cel Thunder — https://github.com/PauliusOS/cel-thunder (MIT)
Optional heavy graphics: Photorealistic Flight Simulator — https://github.com/rlefko/flight-simulator (MIT)

Brobots layer (vehicles, MDP, HUD, missions, share): Brobots Space Factory / brobots.space
```

Preserve upstream copyright notices per MIT terms when vendoring or substantially copying code.

---

## Production roadmap (for whoever ships “for real”)

1. Keep Brobots artifact as **UX/mission/HUD template**.  
2. Replace demo map/physics stubs with **RCForge + OSM** integration.  
3. Speeder: port **Hover Maze** dynamics + raycast hover height into Brobots forest scene.  
4. Wire campus/Multimedia entry + share.  
5. Confirm MIT attribution files on ship.  

---

## Related docs

- Org / services brief: `docs/CLAUDE_ORG_SITE_BRIEF.md`  
- Live campus: https://brobots-space-academy.vercel.app/  
