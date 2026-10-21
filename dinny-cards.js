/* dinny-cards.js — Dinny's SIGN CARDS for BROBOTSvsHUMANSvsALIENS v4.
   CANON (Jessie, 2026-10-21): DINNY DOESN'T TALK. He is a MUTE announcer
   who holds up sign cards ringside — silent-film cue cards. There is no
   dialogue anywhere. Every entry below is CARD TEXT: 1-4 words + numbers.
   DRAFT — pending Jessie's red pen. Edit cards HERE; the game reads
   window.DINNY_CARDS at boot and falls back to a tiny built-in set if
   this file is missing. Placeholders: {N} {NAME} {POT} {AMT} {MOVE}
   {TOTAL}. Moon Tea branding is printed on the cards themselves —
   Dinny is Moon Tea's spokesperson and never speaks the plug. */
window.DINNY_CARDS = {
  card_round:       ["ROUND {N}"],
  card_fight:       ["FIGHT!"],
  card_ko:          ["K.O.!"],
  card_drop:        ["KUDOKEN!"],
  card_claim:       ["+{AMT}"],
  card_gone:        ["GONE!"],
  card_pot:         ["POT: {POT}"],
  card_super:       ["{MOVE}!"],
  card_super_whiff: ["WHIFFED!"],
  card_winner:      ["{NAME} WINS"],
  card_takes:       ["TAKES {TOTAL}"],
  card_moontea:     ["MOON TEA"]
};
