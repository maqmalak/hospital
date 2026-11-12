"""SVG diagram kit for the guide books, in the MicroMax (sugarcane) house style (copied from the realestate guides, D-64): DFD context and level-1 diagrams
(process circles, external entities, open-ended data stores, paired labelled flows) and process-flow charts.

Coordinates are in a 1000 x 540 viewBox (A4 landscape body under the title bar)."""

import html
import math

BLUE = "#2563eb"
LABEL = "#1d4ed8"
INK = "#14213d"
ENT_FILL, ENT_LINE = "#e8eef8", "#1f2a44"
PROC_FILL, PROC_LINE, PROC_NUM = "#fef3e2", "#f0b45a", "#c2410c"
STORE_LINE, STORE_FILL = "#15803d", "#f3fbf6"
W, H = 1000, 540


def esc(s):
	return html.escape(str(s))


def _lines(text):
	return str(text).split("\n")


def _text(x, y, text, size=10.5, color=INK, weight=600, anchor="middle", lh=1.25):
	rows = _lines(text)
	y0 = y - (len(rows) - 1) * size * lh / 2
	spans = "".join(f'<tspan x="{x:.1f}" y="{y0 + i * size * lh + size * 0.35:.1f}">{esc(r)}</tspan>' for i, r in enumerate(rows))
	return f'<text font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{spans}</text>'


class Diagram:
	def __init__(self, legend=True):
		self.nodes, self.parts, self.legend = {}, [], legend

	# ------------------------------------------------------------ shapes
	def entity(self, key, x, y, label, w=136, h=40):
		self.nodes[key] = ("rect", x, y, w, h)
		self.parts.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" rx="4" fill="{ENT_FILL}" stroke="{ENT_LINE}" stroke-width="1.3"/>'
						  + _text(x, y, label, 10.5))

	def process(self, key, x, y, num, label, r=46):
		self.nodes[key] = ("circle", x, y, r)
		self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{PROC_FILL}" stroke="{PROC_LINE}" stroke-width="1.6"/>'
						  + _text(x, y - r * 0.42, num, 10, PROC_NUM, 700) + _text(x, y + 6, label, 10.5))

	def store(self, key, x, y, code, label, w=180, h=26):
		self.nodes[key] = ("rect", x, y, w, h)
		x0, y0 = x - w / 2, y - h / 2
		self.parts.append(
			f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w}" height="{h}" fill="{STORE_FILL}" stroke="none"/>'
			f'<path d="M{x0 + w:.1f},{y0:.1f} H{x0:.1f} V{y0 + h:.1f} H{x0 + w:.1f}" fill="none" stroke="{STORE_LINE}" stroke-width="1.3"/>'
			f'<line x1="{x0 + 32:.1f}" y1="{y0:.1f}" x2="{x0 + 32:.1f}" y2="{y0 + h:.1f}" stroke="{STORE_LINE}" stroke-width="1.1"/>'
			+ _text(x0 + 16, y, code, 10, STORE_LINE, 700) + _text(x0 + 32 + (w - 32) / 2, y, label, 10.3))

	def note(self, x, y, text, size=9, color="#475569", anchor="middle", weight=400):
		self.parts.append(_text(x, y, text, size, color, weight, anchor))

	# ------------------------------------------------------------ flows
	def _edge_point(self, key, tx, ty):
		n = self.nodes[key]
		if n[0] == "circle":
			_k, x, y, r = n
			d = math.hypot(tx - x, ty - y) or 1
			return x + (tx - x) * r / d, y + (ty - y) * r / d
		_k, x, y, w, h = n
		dx, dy = tx - x, ty - y
		if dx == dy == 0:
			return x, y
		sx = (w / 2) / abs(dx) if dx else math.inf
		sy = (h / 2) / abs(dy) if dy else math.inf
		s = min(sx, sy)
		return x + dx * s, y + dy * s

	def _center(self, key):
		n = self.nodes[key]
		return n[1], n[2]

	def _label(self, mx, my, nx, ny, label, lside, ldist, size, lx=0, ly=0):
		"""Label beside a flow: anchored away from the line when the line is steep, centred above / below when flat."""
		ux, uy = nx * lside, ny * lside
		if abs(ux) > 0.55:
			anchor = "start" if ux > 0 else "end"
			x, y = mx + ux * 7, my + uy * 7
		else:
			anchor = "middle"
			x, y = mx + ux * ldist, my + uy * ldist
		self.parts.append(_text(x + lx, y + ly, label, size, LABEL, 500, anchor))

	def flow(self, a, b, label="", off=0.0, lside=1, ldist=13, lpos=0.5, lx=0, ly=0, size=8.8):
		"""Straight arrow from a to b, shifted `off` px sideways (pairs of flows use the same off), label beside it."""
		(ax, ay), (bx, by) = self._center(a), self._center(b)
		dx, dy = bx - ax, by - ay
		d = math.hypot(dx, dy) or 1
		nx, ny = -dy / d, dx / d
		sax, say = ax + nx * off, ay + ny * off
		sbx, sby = bx + nx * off, by + ny * off
		p1 = self._clip_shifted(a, sax, say, sbx, sby, start=True)
		p2 = self._clip_shifted(b, sax, say, sbx, sby, start=False)
		self._line([p1, p2])
		if label:
			mx, my = p1[0] + (p2[0] - p1[0]) * lpos, p1[1] + (p2[1] - p1[1]) * lpos
			self._label(mx, my, nx, ny, label, lside, ldist, size, lx, ly)

	def _line(self, pts):
		d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
		self.parts.append(f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="1.3" marker-end="url(#arr)"/>')

	def _outline(self, key, x, y, tx, ty):
		"""Where the segment from inside the node (x, y) toward (tx, ty) leaves the node's outline."""
		return self._clip_shifted(key, x, y, tx, ty, start=True) if (x, y) != (tx, ty) else (x, y)

	def vflow(self, a, b, label="", x=None, lside=1, size=8.8, lpos=0.5):
		"""Vertical arrow at x (default: a's centre) from a's outline to b's outline."""
		ax, ay = self._center(a)
		bx, by = self._center(b)
		x = ax if x is None else x
		p1 = self._clip_shifted(a, x, ay, x, by, start=True)
		p2 = self._clip_shifted(b, x, ay, x, by, start=False)
		self._line([p1, p2])
		if label:
			self._label(x, p1[1] + (p2[1] - p1[1]) * lpos, 1, 0, label, lside, 0, size)

	def hflow(self, a, b, label="", y=None, size=8.8, above=True):
		"""Horizontal arrow at y (default: a's centre) from a's outline to b's outline, label above (or below)."""
		ax, ay = self._center(a)
		bx, by = self._center(b)
		y = ay if y is None else y
		p1 = self._clip_shifted(a, ax, y, bx, y, start=True)
		p2 = self._clip_shifted(b, ax, y, bx, y, start=False)
		self._line([p1, p2])
		if label:
			self.parts.append(_text((p1[0] + p2[0]) / 2, y + (-9 if above else 11) - (4 * (label.count("\n")) if above else 0), label, size, LABEL, 500))

	def route(self, a, b, via, label="", seg=1, lside=1, size=8.8, lx=0, ly=0):
		"""Elbow arrow: from a's outline toward via[0], through the via points, into b's outline. Label on segment `seg`."""
		ax, ay = self._center(a)
		bx, by = self._center(b)
		first, last = via[0], via[-1]
		p1 = self._clip_shifted(a, ax, ay, first[0], first[1], start=True) if self.nodes[a][0] == "circle" else self._rect_exit(a, first)
		p2 = self._clip_shifted(b, last[0], last[1], bx, by, start=False) if self.nodes[b][0] == "circle" else self._rect_exit(b, last)
		pts = [p1, *via, p2]
		self._line(pts)
		if label:
			(x1, y1), (x2, y2) = pts[seg], pts[seg + 1]
			dx, dy = x2 - x1, y2 - y1
			d = math.hypot(dx, dy) or 1
			self._label((x1 + x2) / 2, (y1 + y2) / 2, -dy / d, dx / d, label, lside, 11, size, lx, ly)

	def _rect_exit(self, key, toward):
		"""For a rectangle: the point on its outline straight toward `toward` along x or y (elbow routing)."""
		_k, x, y, w, h = self.nodes[key]
		tx, ty = toward
		if abs(tx - x) <= w / 2:  # the elbow point is above / below the box
			return tx, (y - h / 2 if ty < y else y + h / 2)
		return (x - w / 2 if tx < x else x + w / 2), ty if abs(ty - y) <= h / 2 else y

	def _clip_shifted(self, key, sax, say, sbx, sby, start):
		"""Point where the shifted segment meets the node's outline."""
		n = self.nodes[key]
		cx, cy = (sax, say) if start else (sbx, sby)
		tx, ty = (sbx, sby) if start else (sax, say)
		if n[0] == "circle":
			_k, x, y, r = n
			# intersect line (cx,cy)->(tx,ty) with circle (x,y,r), take the point toward tx
			dx, dy = tx - cx, ty - cy
			fx, fy = cx - x, cy - y
			a = dx * dx + dy * dy
			b = 2 * (fx * dx + fy * dy)
			c = fx * fx + fy * fy - r * r
			disc = max(b * b - 4 * a * c, 0)
			t = (-b + math.sqrt(disc)) / (2 * a)
			return cx + dx * t, cy + dy * t
		_k, x, y, w, h = n
		dx, dy = tx - cx, ty - cy
		ts = []
		for edge_x in (x - w / 2, x + w / 2):
			if dx:
				t = (edge_x - cx) / dx
				yy = cy + dy * t
				if 0 <= t <= 1 and y - h / 2 - 0.01 <= yy <= y + h / 2 + 0.01:
					ts.append(t)
		for edge_y in (y - h / 2, y + h / 2):
			if dy:
				t = (edge_y - cy) / dy
				xx = cx + dx * t
				if 0 <= t <= 1 and x - w / 2 - 0.01 <= xx <= x + w / 2 + 0.01:
					ts.append(t)
		t = max(ts) if ts else 0
		return cx + dx * t, cy + dy * t

	def pair(self, ent, proc, to_label, from_label, gap=7, ldist=16, size=8.8):
		"""Two parallel flows (entity -> process and back), labels on the outer sides — the context-diagram look."""
		self.flow(ent, proc, to_label, off=-gap, lside=-1, ldist=ldist, size=size, lpos=0.42)  # labels toward the entity's end,
		self.flow(proc, ent, from_label, off=-gap, lside=-1, ldist=ldist, size=size, lpos=0.58)  # where the arrows are apart

	# ------------------------------------------------------------ render
	def svg(self, height=H):
		legend = ""
		if self.legend:
			y = height - 14
			legend = (f'<rect x="20" y="{y - 9}" width="54" height="18" rx="3" fill="{ENT_FILL}" stroke="{ENT_LINE}" stroke-width="1.1"/>'
					  + _text(84, y, "External entity", 9, "#475569", 400, "start")
					  + f'<circle cx="198" cy="{y}" r="9" fill="{PROC_FILL}" stroke="{PROC_LINE}" stroke-width="1.3"/>'
					  + _text(214, y, "Process", 9, "#475569", 400, "start")
					  + f'<path d="M352,{y - 10} H272 V{y + 10} H352" fill="{STORE_FILL}" stroke="{STORE_LINE}" stroke-width="1.1"/>'
					  + f'<line x1="300" y1="{y - 10}" x2="300" y2="{y + 10}" stroke="{STORE_LINE}"/>' + _text(286, y, "D", 9, STORE_LINE, 700)
					  + _text(362, y, "Data store", 9, "#475569", 400, "start")
					  + f'<line x1="430" y1="{y}" x2="462" y2="{y}" stroke="{BLUE}" stroke-width="1.3" marker-end="url(#arr)"/>'
					  + _text(470, y, "Data flow", 9, "#475569", 400, "start"))
		return (f'<svg viewBox="0 0 {W} {height}" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans, Segoe UI, Arial, sans-serif">'
				f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
				f'<path d="M0,0 L10,5 L0,10 z" fill="{BLUE}"/></marker></defs>{"".join(self.parts)}{legend}</svg>')


# ------------------------------------------------------------ process flow charts
FLOW_KINDS = {
	"staff": ("#fef9c3", "#ca8a04"), "role": ("#dbeafe", "#2563eb"), "erp": ("#dcfce7", "#15803d"),
	"doc": ("#f1f5f9", "#64748b"), "end": ("#fde68a", "#b45309"), "ext": ("#fce7f3", "#be185d"),
}


class Flow:
	"""Boxes (kind = staff / role / erp / doc / end / ext), decision diamonds and elbow arrows."""

	def __init__(self):
		self.parts, self.boxes = [], {}

	def box(self, key, x, y, text, kind="erp", w=128, h=44, size=9.3):
		fill, line = FLOW_KINDS[kind]
		rx = 20 if kind == "end" else 3
		self.boxes[key] = (x, y, w, h)
		self.parts.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{line}" stroke-width="1.2"/>'
						  + _text(x, y, text, size, INK, 600 if kind != "doc" else 500))

	def diamond(self, key, x, y, text, w=110, h=60):
		self.boxes[key] = (x, y, w, h)
		self.parts.append(f'<path d="M{x},{y - h / 2} L{x + w / 2},{y} L{x},{y + h / 2} L{x - w / 2},{y} z" fill="#dcfce7" stroke="#15803d" stroke-width="1.2"/>'
						  + _text(x, y, text, 9.3))

	def lane(self, y0, y1, label, fill):
		self.parts.insert(0, f'<rect x="8" y="{y0}" width="984" height="{y1 - y0}" fill="{fill}" opacity=".55"/>'
						  + _text(16, (y0 + y1) / 2, label, 9.5, "#334155", 700, "start"))

	def _port(self, key, side):
		x, y, w, h = self.boxes[key]
		return {"r": (x + w / 2, y), "l": (x - w / 2, y), "t": (x, y - h / 2), "b": (x, y + h / 2)}[side]

	def arrow(self, a, b, sa="r", sb="l", label="", via=None, lx=0, ly=-7, color="#7f1d1d", dashed=False):
		"""Elbow arrow from port sa of a to port sb of b, through optional points (list of (x, y))."""
		p = [self._port(a, sa), *(via or []), self._port(b, sb)]
		if not via and p[0][0] != p[-1][0] and p[0][1] != p[-1][1]:
			if sa in "rl":
				mx = (p[0][0] + p[-1][0]) / 2
				p = [p[0], (mx, p[0][1]), (mx, p[-1][1]), p[-1]]
			else:
				my = (p[0][1] + p[-1][1]) / 2
				p = [p[0], (p[0][0], my), (p[-1][0], my), p[-1]]
		d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in p)
		dash = ' stroke-dasharray="4 3"' if dashed else ""
		self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.3"{dash} marker-end="url(#farr)"/>')
		if label:
			(x1, y1), (x2, y2) = p[0], p[1]
			self.parts.append(_text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, 8.5, "#7f1d1d", 600))

	def legend(self, items, y=520):
		x = 20
		out = []
		for kind, label in items:
			fill, line = FLOW_KINDS[kind]
			out.append(f'<rect x="{x}" y="{y - 8}" width="34" height="16" rx="3" fill="{fill}" stroke="{line}"/>' + _text(x + 42, y, label, 9, "#475569", 400, "start"))
			x += 60 + len(label) * 5.3
		self.parts.append("".join(out))

	def svg(self, height=H):
		return (f'<svg viewBox="0 0 {W} {height}" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans, Segoe UI, Arial, sans-serif">'
				f'<defs><marker id="farr" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
				f'<path d="M0,0 L10,5 L0,10 z" fill="#7f1d1d"/></marker></defs>{"".join(self.parts)}</svg>')
