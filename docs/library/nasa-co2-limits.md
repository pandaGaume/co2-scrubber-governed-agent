# NASA CO2 limits for a crewed habitat, and what they rest on

The limits NASA sets on cabin CO2, the evidence behind them, and the requirements on ventilation and monitoring that go with them. Sources: NASA-STD-3001 Volume 2 Rev C, through the Technical Briefs OCHMO-TB-004 Rev B, *Carbon Dioxide* (November 2022) and OCHMO-TB-002 Rev A, *ECLSS: Human-Centered Approach* (April 2023).

## The limit

- **[V2 6004]** The system shall limit the average one-hour CO2 partial pressure in the habitable volume to no more than **3 mmHg**. Earlier requirements accepted 3.8 to 7.5 mmHg; the limit was lowered on operational and research evidence.
- To keep the risk of headache below 1 %, the **7-day average** must stay below **2.5 mmHg** (a study of ISS Expeditions 2 to 31, 49 astronauts, 19 of whom reported headaches). The 3 mmHg limit keeps the incidence of headaches below about 1.4 %.

## In ppm: it depends on the cabin pressure

A limit in mmHg is a partial pressure. In ppm it is the partial pressure divided by the total pressure:

    ppm = ppCO2 / P_total x 1e6

At 101.3 kPa (sea-level air), 1 mmHg is about 1,316 ppm: 2.5 mmHg is about 3,290 ppm, 3 mmHg about 3,950 ppm. **In a habitat at lower total pressure the same partial pressure is more ppm**: at 56.5 kPa, 3 mmHg is about 7,080 ppm. A ceiling written in ppm is only right for the total pressure it was written for.

For this station at 101.3 kPa: the procedure's abort ceiling of 3,200 ppm is about 2.4 mmHg, under the 7-day headache threshold; ELEVATED at 3,500 ppm is about 2.7 mmHg; CRITICAL at 4,000 ppm is about 3.0 mmHg, the one-hour limit of [V2 6004].

## What was observed (OCHMO-TB-004)

- Headaches reported between 2.8 and 4.5 mmHg, worsening with the level, with fatigue and malaise; above 4.5 mmHg, fatigue, decreased sleep and nausea.
- Several recent studies found no clear effect on decision making or cognition at the levels kept aboard spacecraft and submarines (Scully et al. 2019; Rodehe et al. 2018, as the brief cites it; Basner et al. 2017).
- Apparent sensitivity to CO2 in flight may come from individual predisposition, adaptation to microgravity, and **local fluctuations of CO2 that fixed sensors do not measure** (Law, Watkins and Alexander, 2010).

## Ventilation and monitoring

- **[V2 6107]** Ventilation sufficient to prevent CO2 and thermal pockets from forming. Sleeping stations get individually adjustable airflow; maintenance behind panels is outside the ventilated volume (**[V2 6108]** controls ppCO2 there).
- **[V2 6020]** For each isolatable habitable compartment, ppCO2 recorded continuously; **[V2 6021]** displayed to the crew locally and remotely; **[V2 6022]** the crew alerted when it leaves safe limits; **[V2 6001]** data kept in a form that allows trend analysis.
- A personalized ventilation diffuser near the breathing zone reduces the CO2 a sleeper inhales (Georgescu et al. 2021).

## Lessons from incidents

- Apollo 13 (1970): the lunar module's lithium hydroxide could not support three crew for four days; CO2 reached 14.9 mmHg until the command module's cartridges were adapted, after which it fell to 1 mmHg.
- Soyuz 23 (1976): with the ventilation closed to keep water out after a lake landing, the crew was found alive but incapacitated by CO2.

## For this station

A well-mixed model of a module predicts its average; the crew breathes locally. Compare a twin with the sensor it will be judged against, and remember that the sensor is fixed: a limit held on the average is not proof that no pocket formed near a sleeping crewmember.
