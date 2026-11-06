"""Regenerate docs/API.md from the whitelisted methods: python -m hospital_vvs.devtools.apidoc (run from apps/hospital_vvs)."""

import ast
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run():
	out = ["# VVSDesk API", "", "Generated from `hospital_vvs/api/*.py` by `devtools/apidoc.py`. Path: `/api/method/hospital_vvs.api.<module>.<method>`.",
		"Objects and lists are sent as JSON strings. Roles: what the method checks itself (DocType permissions apply too; PW Admin passes every check).", ""]
	for fn in sorted(os.listdir(os.path.join(HERE, "api"))):
		if not fn.endswith(".py") or fn == "__init__.py":
			continue
		tree = ast.parse(open(os.path.join(HERE, "api", fn)).read())
		mod = fn[:-3]
		rows = []
		for node in tree.body:
			if not isinstance(node, ast.FunctionDef):
				continue
			deco = [d for d in node.decorator_list if "whitelist" in ast.unparse(d)]
			if not deco:
				continue
			d = ast.unparse(deco[0])
			flags = (["guest"] if "allow_guest=True" in d else []) + (["POST"] if "methods=['POST']" in d or 'methods=["POST"]' in d else [])
			roles = ""
			for sub in ast.walk(node):
				if isinstance(sub, ast.Call) and ast.unparse(sub.func) == "require_roles":
					roles = ", ".join(ast.unparse(a).replace("R.", "").replace("*", "") for a in sub.args)
					break
			params = ", ".join(a.arg for a in node.args.args)
			doc = (ast.get_docstring(node) or "").split("\n")[0]
			rows.append(f"| `{node.name}` | {params} | {' '.join(flags)} | {roles} | {doc} |")
		if rows:
			out += [f"## {mod}", "", "| Method | Params | Flags | Roles | Summary |", "|---|---|---|---|---|", *rows, ""]
	open(os.path.join(os.path.dirname(HERE), "docs", "API.md"), "w").write("\n".join(out))
	print("API.md written")


if __name__ == "__main__":
	run()
