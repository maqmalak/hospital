"""bench --site hospital execute hospital_vvs.devtools.generate.run  → writes DocType JSON, then run `bench migrate`."""

from hospital_vvs.devtools import dt, schema_core, schema_ipd, schema_phase1, schema_phase2, schema_phase3, schema_phase4, schema_phase5, schema_phase6, schema_counter

SCHEMAS = [schema_core, schema_phase1, schema_ipd, schema_phase2, schema_phase3, schema_phase4, schema_phase5, schema_phase6, schema_counter]


def run():
	changed = []
	for mod in SCHEMAS:
		for d in mod.all_doctypes():
			if dt.write(d):
				changed.append(d["name"])
	print("changed:", ", ".join(changed) or "nothing")
	return changed
