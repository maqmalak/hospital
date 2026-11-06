# Hospital VVS — VVSDesk

Hospital management for Pakistan on ERPNext v16: OPD, appointments (web + WhatsApp), prescriptions with safety alerts,
wards & beds, billing — React UI in English, Urdu and Arabic (RTL), ERPNext doing accounting and stock underneath.

- Spec: `docs/CLAUDE.md` + `docs/specs/`; progress `docs/PROGRESS.md`; decisions & open questions `docs/DECISIONS.md`; ops `docs/OPS.md`; API `docs/API.md`.
- New site: `./setup_hospital.sh` (needs the MariaDB root password), then
  `bench --site hospital execute hospital_vvs.setup.company.run` and `... hospital_vvs.setup.demo.seed`.
- Frontend: `cd frontend && npm ci && npm run build` (served at `/hms`), or `npm run dev` → http://hospital.localhost:5183.
- Tests: `bench --site hospital run-tests --app hospital_vvs`, `cd frontend && npx vitest run`.
- DocTypes are generated from `hospital_vvs/devtools/schema_*.py`: edit there, run `bench --site hospital execute hospital_vvs.devtools.generate.run`, then `bench migrate`.
