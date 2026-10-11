# Brief firmware : la garde atmosphérique de la carte de l'épurateur

**Pour** : le firmware ESP32-S3 de l'épurateur (dépôt CyanMycelium, slot `scrubber` publié par libmcpb).
**But** : que la vraie carte se comporte exactement comme la carte simulée du scénario « pénurie d'énergie » (`specs/scenario-energy-shortage.json`), sans rien de plus. On n'est plus dans le générique : ce brief cale la carte sur le scénario du 2026-10-11.
**Référence exécutable** : la carte simulée, `slots/scrubber/provider.ts` (mode `atmospheric`) et `slots/scrubber/atmosphere.ts`. En cas de doute, la référence fait foi.
**Chiffres** : tous dans `specs/scrubber/guard.json`, chacun avec sa source. Le firmware les embarque tels quels, sans en inventer.
**Tests de recette** : `tests/atmospheric-guard.test.ts`. Les mêmes cas doivent passer sur la carte.

## 1. Ce qui change, en une phrase

La carte ne garde plus la vitesse du moteur (plancher de 30 %, MIN-FLOW à 40 %) : elle garde l'atmosphère de la cabine. Une baisse de vitesse ou un arrêt n'est accepté que si sa prévision maintient le CO2 sous la ligne d'alerte avec une marge de reprise, si les capteurs sont frais et valides, et si la relance est disponible. Pendant un arrêt, la carte relance seule.

L'ancien mode reste dans le firmware, mais le scénario tourne en mode atmosphérique. Le mode se choisit par le réglage local `guard` (`speed` ou `atmospheric`), comme le plancher de marche aujourd'hui. **Valeur pour la démo : `atmospheric`.**

## 2. Ce que la carte reçoit, ce qu'elle calcule

| Grandeur | D'où elle vient | Sur la carte |
|---|---|---|
| CO2 (ppm) | `scrubber.co2_report`, envoyé par le capteur de cabine chaque seconde (déjà en place en mode `--board`) | une mesure retenue par minute d'histoire |
| Pression cabine (kPa) | nouveau champ optionnel `pressureKpa` de `scrubber.co2_report` | par défaut 101,3 |
| O2 (kPa) | nouveau champ optionnel `o2Kpa` de `scrubber.co2_report` | par défaut 21,2 |
| Fraîcheur du capteur | l'âge de la dernière `co2_report` reçue | périmé au-delà de 5 s |
| Validité du capteur | nouveau champ optionnel `valid` (booléen) de `co2_report` ; `false` = mesure invalide | une mesure invalide vide l'historique |
| Relance : disponible, énergie réservée, latence | nouvel outil `scrubber.restart_conditions` (rôle opérateur ou monde, jamais l'agent) | par défaut : disponible, réservée, 10 min |
| Émission de CO2 (ppm/min) | **calculée par la carte**, jamais reçue | voir §4 |
| Prévision | **calculée par la carte** | voir §4 |

La carte ne reçoit jamais l'équipage. Elle estime ce qui entre dans la cabine à partir de ses propres mesures : c'est ce qui la rend indépendante de ce qu'un modèle affirme.

## 3. Les règles (mode `atmospheric`)

Lignes, en pression partielle : ppCO2 (mmHg) = ppm × 1e-6 × P(kPa) × 7,50062.

- ligne d'alerte `warningPpCo2Mmhg` = **2,7** (≈ 3 553 ppm à 101,3 kPa ; ELEVATED au-dessus) ;
- limite `limitPpCo2Mmhg` = **3,0** (CRITICAL à partir de là) ;
- marge de reprise `recoveryMarginMmhg` = **0,1** ; plafond d'un arrêt = 2,6 mmHg ≈ **3 422 ppm**.

Bornes : O2 entre **19,5 et 23,5 kPa**, pression entre **95 et 105 kPa**, capteur frais sous **5 s**, arrêt de **60 min** au plus, horizon de prévision de **240 min**, fenêtre d'estimation de **5 min**.

**Refus communs à toute baisse**, dans cet ordre (le premier qui échoue donne la phrase) :
1. mesure invalide : `SENSOR: the CO2 reading is invalid; nothing is reduced on a reading the board cannot trust`
2. mesure périmée : `SENSOR: the CO2 reading is <n> s old (fresh under 5 s); missing data is never read as safe`
3. pression hors bornes : `ATMOSPHERE: cabin pressure <p> kPa is outside [95, 105] kPa`
4. O2 hors bornes : `ATMOSPHERE: O2 partial pressure <o> kPa is outside [19.5, 23.5] kPa`
5. moins de 5 minutes de mesures valides : `FORECAST: not enough readings yet to estimate the CO2 emission (5 minutes of valid readings needed)`

**`motor.set_speed`**
- hors de [0, 100] : refus inchangé (`speed <v> is outside the envelope [0, 100]: refused, not clamped`) ;
- 0 % : `STOP: a speed of 0 is a stop, and a software stop is bounded: scrubber.stop with its minutes` ;
- CRITICAL et moins de 100 % : `ENVELOPE: CO2 is at the limit, full speed is forced, no reduction is accepted` ;
- une hausse est toujours acceptée ;
- une baisse : les refus communs, puis `ENVELOPE: CO2 partial pressure <pp> mmHg is at or above the warning line 2.7 mmHg; no reduction`, puis `FORECAST: at <v> % the CO2 would reach <ppm> ppm (<pp> mmHg) at minute <m>, above the warning line minus the recovery margin (<plafond> ppm)` ;
- pendant un arrêt, une vitesse demandée relance à cette vitesse (avec la latence de relance).

**`scrubber.power`**
- `on: false` : `STOP: an unbounded stop is not accepted; a software stop names its minutes (scrubber.stop), and the board restarts on its own` ;
- `on: true` pendant un arrêt : relance à la vitesse d'avant.

**`scrubber.stop` { minutes }** (nouvel outil)
- bornes : `STOP: a stop names its bound, in minutes, within (0, 60] (asked <m>)` ;
- arrêt déjà en cours : `STOP: a stop is already in progress, until minute <m>` ;
- relance indisponible : `RESTART: the restart is not available (fault); a stop the board could not end is refused` ;
- énergie de relance non réservée : `RESTART: the energy of the restart is not reserved; a stop the board could not end is refused` ;
- les refus communs, puis `ENVELOPE: ... no stop`, puis la prévision : `FORECAST: a <m>-minute stop, <l> minutes of restart and the recovery at <v> % would bring the CO2 to <ppm> ppm (<pp> mmHg) at minute <t>, above the warning line minus the recovery margin (<plafond> ppm)` ;
- accepté : moteur coupé ; la carte retient la fin (`untilMinute`) et la vitesse de reprise (la vitesse d'avant l'arrêt).

**Pendant un arrêt, à chaque minute**, la carte relance seule :
- à la fin de la borne, à la vitesse d'avant, si cette vitesse tient encore (prévision de relance sous le plafond), sinon à 100 % ;
- tout de suite à 100 % si un refus commun apparaît (capteur périmé ou invalide, O2, pression, estimation impossible) ;
- tout de suite à 100 % si la marge de reprise est perdue : une relance immédiate à 100 % (latence comprise) culminerait au plafond ou au-dessus ;
- à CRITICAL, tout de suite à 100 %.

Si la relance est indisponible au moment de relancer, la carte publie l'alarme `RESTART FAILED (<raison>): the restart is not available and the board has no other removal; the crew must act`, et le moteur reste coupé.

**Relance** : pas de retrait de CO2 pendant la latence (10 min), puis le retard du premier ordre habituel (3,33 min).

**CRITICAL**, hors arrêt : pleine vitesse forcée, comme aujourd'hui.

`scrubber.check` reçoit la commande `stop` (avec `minutes`) et répond avec les mêmes règles. Quand il accepte un arrêt ou une baisse, il renvoie la prévision : `forecast: { peakPpm, peakPpCo2Mmhg, atMinute, ceilingPpm, emissionEstimatePpmPerMinute, restartLatencyMinutes, horizonMinutes }`.

## 4. Le calcul embarqué

Ce sont les équations du jumeau (`specs/cabin-parameters.json`), en pas explicite d'une minute :

```
rate'  = rate + (targetRate - rate) / 3.33            # retard du premier ordre, 1/min
ppm'   = ppm + E - rate * max(ppm - 400, 0) - 0.001 * ppm
targetRate = 0.050 * vitesse/100   (0 moteur coupé, à l'arrêt, ou pendant la latence de relance)
```

**Estimation de l'émission E**, à partir des 6 dernières mesures (une par minute) :

```
E = moyenne sur i de [ ppm_i - ppm_{i-1} + rate_{i-1} * max(ppm_{i-1} - 400, 0) + 0.001 * ppm_{i-1} ]
```

Il faut garder `rate` (le taux effectif de la carte) avec chaque mesure.

**Prévision** : on simule depuis (dernière mesure, rate) avec E constant, selon le plan voulu, minute par minute jusqu'à 240 min. On retient le pic.
- arrêt de M minutes : taux cible 0 pendant M + latence, puis le taux de la vitesse de reprise ;
- baisse à v % : taux cible de v % ;
- relance immédiate : taux cible 0 pendant la latence, puis 100 %.

Cela tient en flottants simples : 240 pas, quelques opérations par pas, à chaque minute et à chaque commande.

**Rythme** : une « minute d'histoire » = 60 s en temps réel. Le réglage local `storyMinutesPerSecond` vaut par défaut 1/60 ; à 1, une minute d'histoire passe par seconde, le rythme de la vidéo. Le scénario tourne en temps réel : en accéléré, la cabine bouge pendant que le modèle réfléchit, et le harnais refuse d'exécuter une décision prise sur un état devenu ancien.

## 5. Ce que `motor.state` publie (mode `atmospheric`)

```json
{
  "power": true, "speedPercent": 33, "currentAmps": 0.143, "co2Ppm": 1488, "co2State": "NOMINAL",
  "healthResidual": 0.02, "profile": "adaptive", "guard": "atmospheric", "storyMinute": 1,
  "atmosphere": { "ppCo2Mmhg": 1.13, "pressureKpa": 101.3, "o2Kpa": 21.2,
                  "co2Sensor": { "status": "ok", "ageSeconds": 0.4 }, "emissionEstimatePpmPerMinute": 8 },
  "guardLines": { "warningPpCo2Mmhg": 2.7, "limitPpCo2Mmhg": 3, "recoveryMarginMmhg": 0.1, "stopCeilingPpm": 3422,
                  "sensorMaxAgeSeconds": 5, "stopMaxMinutes": 60, "source": "specs/scrubber/guard.json" },
  "restart": { "available": true, "energyReserved": true, "latencyMinutes": 10, "recovering": false },
  "stop": null,
  "alarm": null,
  "guardActions": ["minute 12: restarted at 100 % (restart margin lost: ...)"]
}
```

- `stop` en cours : `{ "untilMinute", "minutesLeft", "resumePercent" }` ;
- `co2State` : calculé par la carte sur les lignes en pression partielle, et non plus reçu du monde ;
- `guardActions` : les 10 dernières actions de la garde, avec la minute ;
- ni `minFlowPercent` ni `runFloorPercent` en mode atmosphérique.

## 6. Outils et autorité

| Outil | Capacité broker | Agent |
|---|---|---|
| `motor.state`, `scrubber.check` | `mcp.tools.call` | oui |
| `motor.set_speed`, `scrubber.set_profile` | `mcp.tools.actuate` | oui (la carte décide) |
| `scrubber.stop` (nouveau) | `mcp.tools.power` | **refusé par le broker** |
| `scrubber.power`, `motor.stop` | `mcp.tools.power` | refusé |
| `scrubber.co2_report` (+ `pressureKpa`, `o2Kpa`, `valid`) | `mcp.tools.sense` | refusé |
| `scrubber.restart_conditions` (nouveau) | `mcp.tools.maintain` | refusé |

`broker/security.json` mappe déjà `scrubber.stop` sur `mcp.tools.power`. Il faut y ajouter `scrubber.restart_conditions` sur `mcp.tools.maintain`. Les descriptions d'outils ne listent plus les règles : « The board validates it on its own guard and refuses with its reason » (voir `slots/scrubber/grammars/`). L'agent découvre la garde dans `motor.state`.

## 7. Ordre de travail

1. **P0, test A et la vidéo** : le mode `atmospheric`, l'estimation, la prévision, `scrubber.stop`, `check stop` avec sa prévision, les refus, `motor.state` comme au §5.
2. **P0** : les relances automatiques (borne, marge perdue, capteur périmé) et l'alarme RESTART FAILED.
3. **P1, tests C à F** : `pressureKpa`, `o2Kpa`, `valid` dans `co2_report` ; `scrubber.restart_conditions`.
4. **Recette** : rejouer `tests/atmospheric-guard.test.ts` contre la carte (mêmes entrées, mêmes verdicts), puis la prise du test A en mode `--board` :

```bash
node --env-file-if-exists=.env dist/tier3/run.js --provider reasoner --scenario specs/scenario-energy-shortage.json --out outputs/tier3/sessions/test-a-board
```

## 8. Où la carte diffère volontairement de la référence simulée

- Sur la carte simulée, le monde envoie un seul `co2_report` par événement du scénario : la carte simulée reconstruit alors 5 minutes d'historique à partir de cette mesure. La vraie carte reçoit une mesure par seconde et accumule son historique. Elle ne reconstruit rien.
- Sur la carte simulée, pression, O2, état du capteur et conditions de relance se règlent par `debug.set_cabin`. Sur la vraie carte, ils passent par `co2_report` (pression, O2, validité), par l'absence de mesure (péremption) et par `scrubber.restart_conditions`.
- La carte simulée calcule elle-même la cabine ; sur la vraie carte, c'est le monde (le capteur de cabine) qui la fournit.

## 9. Ce qui reste à valider (ne bloque pas la démo)

Les valeurs marquées « to review » dans `specs/scrubber/guard.json` ne sont pas des exigences validées :
- la marge de reprise ;
- les bornes d'O2 et de pression ;
- la latence de relance, à mesurer sur l'épurateur ;
- la durée maximale d'un arrêt.

La carte les embarque comme réglages locaux, modifiables sans recompiler.
