import { HourlyVolume } from "./types";

const ENDPOINT = "https://trafikkdata-api.atlas.vegvesen.no/";

interface VegvesenEdge {
  node: {
    from: string;
    to: string;
    total: {
      volumeNumbers: {
        volume: number;
      } | null;
      coverage: {
        percentage: number;
      } | null;
    } | null;
  };
}

interface VegvesenResponse {
  data: {
    trafficData: {
      volume: {
        byHour: {
          edges: VegvesenEdge[];
        };
      };
    } | null;
  } | null;
  errors?: { message: string }[];
}

function buildQuery(stationId: string, from: string, to: string): string {
  return JSON.stringify({
    query: `
      query ($id: String!, $from: ZonedDateTime!, $to: ZonedDateTime!) {
        trafficData(trafficRegistrationPointId: $id) {
          volume {
            byHour(from: $from, to: $to) {
              edges {
                node {
                  from
                  to
                  total {
                    volumeNumbers {
                      volume
                    }
                    coverage {
                      percentage
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: { id: stationId, from, to },
  });
}

export async function fetchHourlyVolume(
  stationId: string,
  from: string,
  to: string
): Promise<HourlyVolume[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildQuery(stationId, from, to),
  });

  if (!response.ok) {
    throw new Error(`Vegvesen API error: ${response.status} ${response.statusText}`);
  }

  const json: VegvesenResponse = await response.json();

  if (json.errors?.length) {
    throw new Error(`Vegvesen GraphQL error: ${json.errors[0].message}`);
  }

  const edges = json.data?.trafficData?.volume?.byHour?.edges ?? [];

  return edges.map((edge) => ({
    stationId,
    from: edge.node.from,
    to: edge.node.to,
    total: edge.node.total?.volumeNumbers?.volume ?? 0,
    coverage: edge.node.total?.coverage?.percentage ?? 0,
    validLength: (edge.node.total?.coverage?.percentage ?? 0) > 50,
  }));
}

export async function fetchLatestHourForAllStations(
  stationIds: string[]
): Promise<(HourlyVolume | null)[]> {
  const { from, to } = getRecentHoursRange();

  const results = await Promise.all(
    stationIds.map(async (stationId) => {
      try {
        const volumes = await fetchHourlyVolume(stationId, from, to);
        const valid = volumes.filter((v) => v.coverage > 50);
        if (valid.length === 0) return null;
        return valid[valid.length - 1];
      } catch {
        return null;
      }
    })
  );

  return results;
}

export function getRecentHoursRange(): { from: string; to: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const to = now.toISOString();
  // Vegvesen API has 3-4 hour data delay, fetch 6 hours to be safe
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const from = sixHoursAgo.toISOString();
  return { from, to };
}
