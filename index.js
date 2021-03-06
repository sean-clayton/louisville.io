var fs = require("fs");
var path = require("path");
var ical2json = require("ical2json");
var groups = require("./data/groups");
var R = require("ramda");

var icsDir = "ics";
var eventJson = "data/events.json";

var events = R.pipe(
	R.reject(hiddenFile),
	R.map(loadCal),
	R.flatten,
	R.sortBy(startTime)
)(fs.readdirSync(icsDir));

writeJson(eventJson, events);

function hiddenFile(file) {
	return file[0] === ".";
}

function loadCal(filename) {
	var cal = cal2vcal(ical2json.convert(readUtf8(wholePath(filename))));
	var group = filename.substr(0, filename.indexOf("."));

	var events = [];
	if (cal) {
		events = R.pipe(
			R.flatten,
			R.map(cal2tz),
			R.flatten,
			R.map(tz2event),
			R.flatten,
			R.map(fixEvent.bind(undefined, group)),
			R.sortBy(startTime),
			R.reject(isOld)
		)(cal);
	}
	writeJson("data/group-events/" + group + ".json", events);
	return events;
}

function writeJson(path, data) {
	fs.writeFileSync(path, JSON.stringify(data, null, 4), { encoding: 'UTF8' });
}

function wholePath(file) {
	return path.join(icsDir, file);
}
function readUtf8(path) {
	return fs.readFileSync(path, { encoding: 'UTF8' });
}
function cal2vcal(cal) {
	return cal.VCALENDAR;
}
function cal2tz(cal) {
	return cal.VTIMEZONE || [];
}
function tz2event(tz) {
	if (tz.VTIMEZONE) {
		tz = tz.VTIMEZONE[0];
	}
	return tz.VEVENT;
}

function isOld(event) {
	var start = startTime(event);

	var now = new Date(Date.now());
	now.setDate(now.getDate() - 1);

	return start < now;
}

function startTime(event) {
	for (var prop in event) {
		if (event.hasOwnProperty(prop)) {
			if (prop.indexOf("DTSTART") === 0) {
				return toDate(event[prop]);
			}
		}
	}
}

function endTime(event) {
	for (var prop in event) {
		if (event.hasOwnProperty(prop)) {
			if (prop.indexOf("DTEND") === 0) {
				return toDate(event[prop]);
			}
		}
	}
}

function toDate(timeStr) {
	var parts = timeStr.split(":");

	var tz = "US-Eastern";
	var datetime = timeStr;
	if (parts.length > 1) {
		if (parts.indexOf("TZID=") === 0) {
			tz = parts.substr(5);
		}
		datetime = parts[1];
	}
	parts = datetime.split("T");
	var date = parts[0];
	var time = parts[1] || "";

	var year = parseInt(date.substr(0, 4));
	var month = parseInt(date.substr(4, 2)) - 1;
	var day = parseInt(date.substr(6, 2));
	var hour = parseInt(time.substr(0, 2)) || 0;
	var min = parseInt(time.substr(2, 2)) || 0;
	var sec = parseInt(time.substr(4, 2)) || 0;
	if (time[6] === "Z") {
		return new Date(Date.UTC(year, month, day, hour, min, sec));
	} else {
		return new Date(year, month, day, hour, min, sec);
	}
}

function fixText(text) {
	if (text) {
		return text.replace(/\\n/g, "\n").replace(/\\,/g, ",");
	}
	return text;
}

function fixEvent(group, event) {
	event.SUMMARY = fixText(event.SUMMARY);
	event.DESCRIPTION = fixText(event.DESCRIPTION);
	event.LOCATION = fixText(event.LOCATION);
	if (event.LOCATION) {
		event.mapQuery = event.LOCATION.replace("(", " ").replace(")", " ");
	}
	var start = startTime(event);
	event.startDate = start.toString();
	event.startDateJson = start.toJSON();

	var end = endTime(event);
	event.endDate = end.toString();
	event.endDateJson = end.toJSON();
	if (end < Date.now()) {
		event.expired = true;
	}

	event.group = group;
	event.groupName = groups[group].name;
	event.groupUrl = groups[group].web;
	return event;
}
