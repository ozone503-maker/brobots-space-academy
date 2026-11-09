# Fighter art status (Oct 25 2026)

- Style guide for drawing new fighters in ChatGPT: fighter_style_guide.md
- Heights: measure to top of skull, not hair or hats. All humans 6 ft. Tank 7 ft max (about 1.17x a human).
- DONE (Nov 2 2026): heights fixed, measured skull top to feet (under Gavin's cap, Ozone's top knot, Tank's fedora). Punch-out scale: every human 662 px skull to feet (Gavin's approved scale), Tank 775 px (1.17x). Feet stay on y 1231. Sprite boxes now Gavin 674, Jay 666, Ozone 697, Tank 811 px tall. Old files kept as *_v_prefix_heights.png in the work folders.
- DONE (Nov 2 2026): lineup.png rebuilt, all four on one baseline with 6 ft and 7 ft guide lines at the skull tops.
- TODO: HUD name is baked into the mockup background (shows GAVIN DAWSON on every fighter).
- TODO: 19 unique backgrounds. 12 of 19 home bases received, see Backgrounds below.

## Backgrounds (received Oct 30 2026)

- Source: Jessie's Muse share "Fighting Game Landscapes" (https://muse.ai/s/fighting-game-landscapes-zl6xw8icxm2xgl/H1z4vwSKQw_WlIaaPLXjT0fjIotGVuDW3_589VS2Ew8). Downloaded the original files the gallery serves (its full-screen and Download buttons use these same files).
- **Received: 36 images vs 19 needed.** But only **12 of 19 home bases** are finished (bg01-bg12, v2 matched style). bg13-bg28 are 16 older Hawaii stage landscapes and bg29-bg36 are 8 older robot stages (earlier art pass).
- Still missing, 7 home bases (from the gallery's list): Pilot (Mauna Kea), Mantis (Rainbow Falls), Ipo (FlashTown), Erv (Rooster Island Swamp Lab), Buff Bro Bot (Kona Pier), Tank (Space Factory), Nonna (Kilauea). Older stand-ins exist for several: bg13/14 Mauna Kea, bg24 Rainbow Falls, bg16-18 FlashTown, bg30 Erv, bg25 Kona Pier, bg29 Tank, bg15 Kilauea.
- Contact sheet: backgrounds/contact_sheet.jpg
- Home bases are not all one size: 1920x1280 (3:2), 2240x1120 (2:1), 2352x1008 (7:3), 2736x912 (3:1). Every stage/robot image is 1280x720 (16:9).

| File | Section | Fighter / name | Place | Size |
|---|---|---|---|---|
| bg01.webp | Home base | Gavin “The General” | Arlington Stadium Lot, Arlington, Texas | 1920x1280 |
| bg02.webp | Home base | Rich | The Alamo, San Antonio, Texas | 2240x1120 |
| bg03.webp | Home base | 4Waze | Ancestral Land, Creek & Oak, Chico | 1920x1280 |
| bg04.webp | Home base | Jay | Mt. Shasta | 1920x1280 |
| bg05.webp | Home base | Dia | Multnomah Falls, Oregon | 1920x1280 |
| bg06.webp | Home base | Jeff “Straight Lace” | His Garden, Beaverton | 2240x1120 |
| bg07.webp | Home base | Gabe “Dirty Blakk” | Portland Airport | 1920x1280 |
| bg08.webp | Home base | Ozone | Kona Airport Tarmac | 2352x1008 |
| bg09.webp | Home base | Ryan | Rooster Island, Dusk | 2736x912 |
| bg10.webp | Home base | Vidu | Eden Nova, Four Fruit Trees | 2736x912 |
| bg11.webp | Home base | ShockBot | Hip-Hop Club, Pāhoa | 2352x1008 |
| bg12.webp | Home base | Monkey Jockey | Big Banyan Tree, Hilo | 1920x1280 |
| bg13.jpg | Hawaii stage | Mauna Kea | Hawaiʻi Stage | 1280x720 |
| bg14.jpg | Hawaii stage | Mauna Kea II | Hawaiʻi Stage, Variant | 1280x720 |
| bg15.jpg | Hawaii stage | Kīlauea | Hawaiʻi Stage | 1280x720 |
| bg16.jpg | Hawaii stage | FlashTown | Hawaiʻi Stage | 1280x720 |
| bg17.jpg | Hawaii stage | FlashTown II | Hawaiʻi Stage, Variant | 1280x720 |
| bg18.jpg | Hawaii stage | FlashTown III | Hawaiʻi Stage, Variant | 1280x720 |
| bg19.jpg | Hawaii stage | Eden Nova | Hawaiʻi Stage | 1280x720 |
| bg20.jpg | Hawaii stage | Eden Nova II | Hawaiʻi Stage, Variant | 1280x720 |
| bg21.jpg | Hawaii stage | Rooster Island, Dusk | Hawaiʻi Stage | 1280x720 |
| bg22.jpg | Hawaii stage | Rooster Island, Dusk II | Hawaiʻi Stage, Variant | 1280x720 |
| bg23.jpg | Hawaii stage | Rooster Island, Dusk III | Hawaiʻi Stage, Variant | 1280x720 |
| bg24.jpg | Hawaii stage | Rainbow Falls | Hawaiʻi Stage | 1280x720 |
| bg25.jpg | Hawaii stage | Kona Pier | Hawaiʻi Stage | 1280x720 |
| bg26.jpg | Hawaii stage | Hilo Bay | Hawaiʻi Stage | 1280x720 |
| bg27.jpg | Hawaii stage | Makuʻu | Hawaiʻi Stage | 1280x720 |
| bg28.jpg | Hawaii stage | Waikoloa | Hawaiʻi Stage | 1280x720 |
| bg29.jpg | Robot stage | Tank | Space Factory | 1280x720 |
| bg30.jpg | Robot stage | Erv | Swamp Lab Stage | 1280x720 |
| bg31.jpg | Robot stage | Ipo | Robot Stage | 1280x720 |
| bg32.jpg | Robot stage | Buff Bro Bot | Robot Stage | 1280x720 |
| bg33.jpg | Robot stage | Bull | Robot Stage | 1280x720 |
| bg34.jpg | Robot stage | Monkey | Robot Stage | 1280x720 |
| bg35.jpg | Robot stage | Nonna | Robot Stage | 1280x720 |
| bg36.jpg | Robot stage | ShockBot | Robot Stage, Early Pass | 1280x720 |

## Shared 2D cut-out rig (Nov 2 2026)

- Folder: fighter-art/rig/. Open rig/viewer.html (works from file:// or any static server, no CDN). Buttons: Idle, Jab left, Jab right, Block, Dodge left, Dodge right, Hit, Front kick left/right, Roundhouse left/right. Checkboxes for bone overlay and slow motion.
- rig/skeleton.json: generic skeleton "bvh-punchout-front-v1" (16 bones: root, pelvis, torso, head, upperarm/forearm/fist L+R, thigh/shin/boot L+R), parent hierarchy, reference pivots, draw order, 2-bone leg IK that keeps boots planted. L/R = SCREEN side (L is the fighter's own right hand).
- rig/animations.json: shared keyframes (rot, x, y, sx, sy per bone, plus flash on root, plus foot_L/foot_R slides). jab_R and dodge_R are mirrors of jab_L and dodge_L.
- rig/gavin/skin.json: Gavin's part images, offsets from each bone pivot, pivots, IK foot targets, scale. New fighter = cut parts with the same names, write its own skin.json (pivots for its art, scale 1.17 for Tank), add it to tools/build_skin.py so it gets embedded.
- rig/gavin/parts/: 15 transparent PNGs cut from gavin3d/fighter25d/gavin_upright_full.png (original untouched). The forearm+fist limb is two layers (forearm sleeve + fist) so the fist can grow toward the camera on a jab; a single piece could not do that without stretching the sleeve. Hidden areas are filled (shoulders under the fists, pants and belt under the jacket hem, neck under the beard, sleeves under the fists). Rest pose recomposes to the original (about 0.3 percent of pixels differ, all on anti-aliased edges).
- Tools: rig/tools/cut_gavin.py (cut + fill), build_skin.py (skin.json + embed JSON into viewer), render_frames.py (headless Chrome via Playwright), make_preview.py (rig/gavin/preview_sheet.png).
- Known flaws: filled areas (shoulder tops behind the fists, pants under the jacket) are smoother and less detailed than the inked art and show briefly on jabs, hits and dodges; tiny olive specks remain on the edge of the fists.
- Kicks (added Nov 2 2026): kick_front_L/R (reworked: the kicking leg runs on FK via fk 1 on its foot track, so the knee never bends outward; the knee lifts with the thigh foreshortened to 0.3, the shin flips through sy 0 to -1.6 so it points up at the camera, and the boot flips sole-up and grows to 2.3x at chest/shoulder height in front of the body; slight lean back, support leg planted, arms in guard) and kick_round_L/R (pelvis tilts up, torso and head lean away, kicking leg swings out to the screen side, boot turns with the shin). _R versions are mirrors. Shin and boot are now separate parts: the shin ends at the pant cuff, the boot has its shaft filled under the cuff and is pivoted at the ankle (= IK foot target). Boots stay level by default (fixes the old dodge boot tilt); boot tracks can set follow 1 to turn with the shin. New track channels: z (raised-leg layer under the pelvis, mirror safe) and follow. Knees are round joints (thigh bottom cut to a disc around the knee pivot, shin top filled as a disc) and thighs have a filled hip cap under the pelvis.
- Kick flaws: the shin top and hip caps are filled areas and read a little flat when the knee bends hard (roundhouse chamber); a small flat olive tab shows at the crotch at roundhouse peak; the front kick reads as the boot coming at the camera, but the sole is never shown (no sole art); the right roundhouse boot touches the right edge of the 540 px viewer canvas at full extension (framing only); front kick: around t 0.2 to 0.25 the boot is a thin squashed sliver while it flips toward the camera, the flipped boot shows the boot upside down (sole up) rather than real sole art, and the lower shin is mostly hidden behind the boot at the peak.

### Gavin rig: FINAL (Nov 2 2026)
- Status: Gavin's rig and all 11 animations (idle, jab L/R, block, dodge L/R, hit, front kick L/R, roundhouse L/R) are final. The two flaw lists above are history; this list replaces them.
- Front kick: at the peak the boot is swapped for a locally drawn sole view (tools/make_sole.py makes gavin/parts/sole_L.png and sole_R.png: ink outline, leather rim and welt, rubber sole with chevron lugs, heel bars, arch, shading and hatching, plus a soft drop shadow). The boot fades out (alpha track) while the sole grows in from boot size, so there is no sliver frame. The peak is centered on the body, below the fists and face. The shin is drawn in FK mode without the thigh's squash, so the knee and cuff read behind the heel.
- New viewer features: overlay parts (gavin/overlays.json) with alpha, z, x/y and sx/sy tracks, and an optional drop shadow.
- Cut fixes: filled areas get edge shading and diagonal ink hatching; stray alpha islands (the fist and collar specks) are dropped; the pelvis bottom is rounded and the thigh crotch spike is trimmed, so the roundhouse no longer shows the olive tab or notch. Hit: the flash is down to 0.1, and the head and upper-arm motion is smaller, so the collar edge and the inner upper-arm line no longer show.
- Remaining known flaws (minor): at the front-kick peak the raised knee is a squashed, rounded pant mass with fairly plain shading, and the sole is a drawn graphic, so it is slightly cleaner than the hand-inked art. For about one frame (t 0.2) the fading boot and the small sole overlap. The rest-pose rebuild differs from the source by about 10k anti-aliased edge pixels (invisible at game size). The right roundhouse boot still touches the right edge of the 540 px canvas at full extension (framing only).

## Gavin rig: in the fight3d scene

- fight3d/rig2d.js draws the cut-out rig (fighter-art/rig/rig.js runtime, same skeleton.json, animations.json, gavin/skin.json) onto a camera-facing card in the 3D ring. The card is a real 1.83 m tall (1209 art px skull to soles), and the 3D Gavin mesh is hidden but still drives the camera. ?rig=0 brings the mesh back.
- With the rig on, the camera holds about 4.0 m from the opponent, so Gavin measures 660 device px skull to feet in a 780x1688 phone frame (target 662, punch-out scale). ?camdist= overrides.
- Game states map to rig anims: idle, block, dodge_L/R, hit, jab_L/R (jab, hook and uppercut all use the jabs), kick_front_L/R (kHigh, kMid), kick_round_L/R (kSide, kRound, kSweep, super). Changing anims crossfades for 0.09 s; knockdowns tilt the card back.
- The CPU Gavin now throws kicks as well (cpu.js adds kick combos for the non-player side).
- fight3d/backdrop.js paints fighter-art/backgrounds/bg01.webp (Arlington Stadium Lot) behind the ring and hides the island scenery. ?bg=bg12 picks another painting, ?bg=0 keeps the volcano island.
- The player hit flash is softer (DOM flash 0.4, was 0.9). The rig flash is scaled by 0.6.
- The front kick boot to sole swap is now a clean cut at t 0.185 to 0.19 and 0.535 to 0.54, so there is no frame with both visible. The viewer draws at 0.8 of canvas height, so the right roundhouse no longer touches the edge.
- Capture: python3 fight3d/tools/capture.py OUTDIR SECONDS FPS uses fight3d.html?auto&cap&speed=1, which steps the game by hand (window.capStep) in headless Chrome at 390x844 @2x.

## Gavin rig: motion polish (v2)

- Idle has stronger breathing, weight shift (feet + pelvis), and a light torso twist. Crossfades last 0.16 s. Head, arms and fists lag a little behind the body for follow-through; punch scale still snaps so hooks and uppercuts pop.
- Walk cycle (animations.json walk) plays when Gavin moves, blended with idle at low speed. Capture can force it with window.__walkBias.
- Real hook_L/R and upper_L/R replace the old jab remaps. fall + getup crumple him to the mat instead of tipping the card.
- Player fists are electric blue Kudoken (additive glow, cyan tracers), scaled to 0.5 and held in a high, wide, far guard so they frame Gavin instead of covering him.
- HUD names come from F[i].name (YOU / GAVIN DAWSON).
- Backdrops load from fighter-art/backgrounds/stages.json: still plate, horizon, fog, and optional moving layers. bg01 ships a procedural steam overlay as the cheap demo. Ring wash + contact disc seat the canvas into the lot.
- Scripted capture: fight3d/tools/capture_script.py drives walk, hook, upper, kick and knockdown via window.__force.
