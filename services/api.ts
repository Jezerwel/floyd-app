const CLOUD_SERVER = 'https://floyd-feeder.up.railway.app';

export async function fetchSchedules() {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`);
  return res.json();
}

export async function createSchedule(data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSchedule(id: string, data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSchedule(id: string) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function fetchAlertConfig() {
  const res = await fetch(`${CLOUD_SERVER}/api/alerts/config`);
  return res.json();
}

export async function updateAlertConfig(data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/alerts/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchFeedHistory(limit = 50) {
  const res = await fetch(`${CLOUD_SERVER}/api/history?limit=${limit}`);
  return res.json();
}
