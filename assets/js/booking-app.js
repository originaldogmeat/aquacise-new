/**
 * Private lesson booking — calendar from _data/private_lesson_booking.yml,
 * persistence via Supabase REST (see docs/booking-supabase-setup.md).
 */
(function () {
	"use strict";

	var DateTime = typeof luxon !== "undefined" ? luxon.DateTime : null;

	function readJsonScript(id) {
		var el = document.getElementById(id);
		if (!el || !el.textContent) return null;
		try {
			return JSON.parse(el.textContent);
		} catch (e) {
			console.error("booking: invalid JSON in", id, e);
			return null;
		}
	}

	function parseHm(s) {
		var p = (s || "0:0").split(":");
		return { h: parseInt(p[0], 10) || 0, m: parseInt(p[1], 10) || 0 };
	}

	function normalizeDayWindows(wh) {
		if (!wh) return [];
		if (Array.isArray(wh)) return wh;
		if (wh.start && wh.end) return [wh];
		return [];
	}

	function pushSlotsInRange(slots, d, duration, ds, de, now, blockedStarts) {
		var dayStart = d.set({ hour: ds.h, minute: ds.m, second: 0, millisecond: 0 });
		var dayEndLimit = d.set({ hour: de.h, minute: de.m, second: 0, millisecond: 0 });
		var t = dayStart;
		while (t < dayEndLimit) {
			var slotEnd = t.plus({ minutes: duration });
			if (slotEnd > dayEndLimit) break;
			if (t > now) {
				var startKey = t.toFormat("yyyy-MM-dd HH:mm");
				if (!blockedStarts.has(startKey)) {
					slots.push({ start: t, end: slotEnd });
				}
			}
			t = slotEnd;
		}
	}

	function generateSlots(rules) {
		if (!DateTime) return [];
		var tz = rules.timezone || "America/Los_Angeles";
		var duration = rules.slot_duration_minutes || 30;
		var weekdays = new Set(rules.weekdays || [1, 2, 3, 4, 5]);
		var closed = new Set(rules.closed_dates || []);
		var defaultStart = parseHm(rules.daily_start || "09:00");
		var defaultEnd = parseHm(rules.daily_end || "17:00");

		var weekdayHours = rules.weekday_hours;
		var useWeekdayHours =
			weekdayHours &&
			typeof weekdayHours === "object" &&
			!Array.isArray(weekdayHours) &&
			Object.keys(weekdayHours).length > 0;

		var blockedStarts = new Set(rules.blocked_slot_starts || []);

		var now = DateTime.now().setZone(tz);
		var day0 = now.startOf("day");
		var slots = [];

		for (var i = 0; i < 14; i++) {
			var d = day0.plus({ days: i });
			var ymd = d.toFormat("yyyy-MM-dd");
			if (closed.has(ymd)) continue;

			if (useWeekdayHours) {
				var wh =
					weekdayHours[d.weekday] ||
					weekdayHours[String(d.weekday)];
				var windows = normalizeDayWindows(wh);
				if (windows.length === 0) continue;
				for (var w = 0; w < windows.length; w++) {
					var win = windows[w];
					if (!win || !win.start || !win.end) continue;
					var ds = parseHm(win.start);
					var de = parseHm(win.end);
					pushSlotsInRange(slots, d, duration, ds, de, now, blockedStarts);
				}
			} else {
				if (!weekdays.has(d.weekday)) continue;
				pushSlotsInRange(slots, d, duration, defaultStart, defaultEnd, now, blockedStarts);
			}
		}
		return slots;
	}

	function overlaps(a0, a1, b0, b1) {
		return a0 < b1 && b0 < a1;
	}

	function slotBooked(slotStart, slotEnd, bookings) {
		var s0 = slotStart.toUTC();
		var s1 = slotEnd.toUTC();
		for (var i = 0; i < bookings.length; i++) {
			var b = bookings[i];
			var b0 = DateTime.fromISO(b.starts_at, { zone: "utc" });
			var b1 = DateTime.fromISO(b.ends_at, { zone: "utc" });
			if (overlaps(s0, s1, b0, b1)) return true;
		}
		return false;
	}

	async function fetchBookings(baseUrl, anonKey, tz) {
		if (!DateTime) return [];
		var start = DateTime.now().setZone(tz).startOf("day");
		var isoStart = start.toUTC().toISO();
		/* One-sided range is enough; UI only generates 14 days from today */
		var q =
			"select=starts_at,ends_at&starts_at=gte." +
			encodeURIComponent(isoStart) +
			"&order=starts_at.asc";
		var res = await fetch(baseUrl + "/rest/v1/bookings?" + q, {
			headers: {
				apikey: anonKey,
				Authorization: "Bearer " + anonKey,
				Accept: "application/json",
			},
		});
		if (!res.ok) {
			var t = await res.text();
			throw new Error("Could not load bookings (" + res.status + "): " + t.slice(0, 200));
		}
		return res.json();
	}

	async function createBooking(baseUrl, anonKey, payload) {
		var res = await fetch(baseUrl + "/rest/v1/bookings", {
			method: "POST",
			headers: {
				apikey: anonKey,
				Authorization: "Bearer " + anonKey,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(payload),
		});
		if (res.status === 409) {
			return { ok: false, conflict: true };
		}
		if (!res.ok) {
			var t = await res.text();
			if (t.indexOf("23505") !== -1 || t.toLowerCase().indexOf("unique") !== -1) {
				return { ok: false, conflict: true };
			}
			return { ok: false, message: t.slice(0, 300) };
		}
		return { ok: true };
	}

	function renderCalendar(container, slots, bookings, tz, onPick) {
		container.innerHTML = "";
		var byDay = {};
		for (var i = 0; i < slots.length; i++) {
			var s = slots[i];
			var key = s.start.setZone(tz).toFormat("yyyy-MM-dd");
			if (!byDay[key]) byDay[key] = [];
			byDay[key].push(s);
		}
		var keys = Object.keys(byDay).sort();
		if (keys.length === 0) {
			container.innerHTML = "<p>No open slots in the next 14 days. Try again later or contact us by email.</p>";
			return;
		}
		for (var k = 0; k < keys.length; k++) {
			var dayKey = keys[k];
			var daySlots = byDay[dayKey];
			var col = document.createElement("div");
			col.className = "booking-day";
			var h = document.createElement("div");
			h.className = "booking-day__date";
			var first = daySlots[0].start.setZone(tz);
			h.textContent = first.toFormat("ccc, LLL d");
			col.appendChild(h);
			var list = document.createElement("div");
			list.className = "booking-day__slots";
			for (var j = 0; j < daySlots.length; j++) {
				var sl = daySlots[j];
				var booked = slotBooked(sl.start, sl.end, bookings);
				var btn = document.createElement("button");
				btn.type = "button";
				btn.className = "booking-slot" + (booked ? " booking-slot--booked" : "");
				btn.textContent = sl.start.setZone(tz).toFormat("h:mm a") + " – " + sl.end.setZone(tz).toFormat("h:mm a");
				btn.disabled = booked;
				if (!booked) {
					(function (slot) {
						btn.addEventListener("click", function () {
							onPick(slot);
						});
					})(sl);
				}
				list.appendChild(btn);
			}
			col.appendChild(list);
			container.appendChild(col);
		}
	}

	function init() {
		var rules = readJsonScript("booking-rules-json");
		var backend = readJsonScript("booking-backend-json") || {};
		var appEl = document.getElementById("booking-app");
		var unconfiguredEl = document.getElementById("booking-unconfigured");
		var calEl = document.getElementById("booking-calendar");
		var errEl = document.getElementById("booking-error");
		var tzLabel = document.getElementById("booking-tz-label");
		var modal = document.getElementById("booking-modal");
		var form = document.getElementById("booking-modal-form");
		var modalSlot = document.getElementById("booking-modal-slot");
		var modalStatus = document.getElementById("booking-modal-status");
		var btnCancel = document.getElementById("booking-modal-cancel");

		if (!rules || !appEl || !calEl) return;

		var url = (backend.supabase_url || "").replace(/\/$/, "");
		var anon = backend.supabase_anon_key || "";

		if (!DateTime) {
			if (errEl) {
				errEl.hidden = false;
				errEl.textContent = "Calendar library failed to load. Check your network connection.";
			}
			return;
		}

		var tz = rules.timezone || "America/Los_Angeles";
		if (tzLabel) tzLabel.textContent = tz.replace(/_/g, " ");

		if (!url || !anon) {
			if (unconfiguredEl) unconfiguredEl.hidden = false;
			return;
		}

		var selected = null;

		function showError(msg) {
			if (errEl) {
				errEl.hidden = !msg;
				errEl.textContent = msg || "";
			}
		}

		function openModal(slot) {
			selected = slot;
			modalStatus.textContent = "";
			form.reset();
			modalSlot.textContent =
				slot.start.setZone(tz).toFormat("cccc, LLL d, yyyy") +
				" · " +
				slot.start.setZone(tz).toFormat("h:mm a") +
				" – " +
				slot.end.setZone(tz).toFormat("h:mm a");
			if (modal.showModal) modal.showModal();
		}

		function closeModal() {
			if (modal.close) modal.close();
			selected = null;
		}

		btnCancel.addEventListener("click", closeModal);

		form.addEventListener("submit", async function (e) {
			e.preventDefault();
			if (!selected) return;
			var fd = new FormData(form);
			var name = (fd.get("name") || "").toString().trim();
			var email = (fd.get("email") || "").toString().trim();
			var phone = (fd.get("phone") || "").toString().trim();
			if (!name || !email) return;

			modalStatus.textContent = "Saving…";
			var submitBtn = document.getElementById("booking-modal-submit");
			submitBtn.disabled = true;

			var payload = {
				starts_at: selected.start.toUTC().toISO(),
				ends_at: selected.end.toUTC().toISO(),
				name: name,
				email: email,
				phone: phone || null,
			};

			var result = await createBooking(url, anon, payload);
			submitBtn.disabled = false;

			if (result.ok) {
				modalStatus.textContent = "Booked! We’ll follow up by email.";
				try {
					var bookings = await fetchBookings(url, anon, tz);
					renderCalendar(calEl, generateSlots(rules), bookings, tz, openModal);
				} catch (err) {
					console.error(err);
				}
				setTimeout(closeModal, 1200);
				return;
			}
			if (result.conflict) {
				modalStatus.textContent = "That time was just taken. Please pick another slot.";
				try {
					var b2 = await fetchBookings(url, anon, tz);
					renderCalendar(calEl, generateSlots(rules), b2, tz, openModal);
				} catch (err2) {
					console.error(err2);
				}
				return;
			}
			modalStatus.textContent = "Could not book: " + (result.message || "Unknown error");
		});

		(async function load() {
			showError("");
			try {
				var bookings = await fetchBookings(url, anon, tz);
				var slots = generateSlots(rules);
				renderCalendar(calEl, slots, bookings, tz, openModal);
				appEl.hidden = false;
			} catch (err) {
				console.error(err);
				showError(err.message || "Failed to load calendar.");
			}
		})();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
