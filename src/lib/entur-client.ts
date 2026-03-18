const ENDPOINT = "https://api.entur.io/journey-planner/v3/graphql";
const MOSS_FERJEKAI = "NSR:StopPlace:58092";
const CLIENT_NAME = "mosstrafikk-krescado";

export interface FerryDeparture {
  time: string; // ISO timestamp
  destination: string;
  minutesUntil: number;
}

export async function fetchFerryDepartures(count = 3): Promise<FerryDeparture[]> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ET-Client-Name": CLIENT_NAME,
      },
      body: JSON.stringify({
        query: `{
          stopPlace(id: "${MOSS_FERJEKAI}") {
            estimatedCalls(numberOfDepartures: ${count}, timeRange: 14400) {
              expectedDepartureTime
              destinationDisplay { frontText }
            }
          }
        }`,
      }),
    });

    if (!response.ok) return [];

    const json = await response.json();
    const calls = json?.data?.stopPlace?.estimatedCalls ?? [];

    const now = Date.now();

    return calls.map(
      (call: { expectedDepartureTime: string; destinationDisplay: { frontText: string } }) => {
        const time = new Date(call.expectedDepartureTime);
        return {
          time: call.expectedDepartureTime,
          destination: call.destinationDisplay.frontText,
          minutesUntil: Math.round((time.getTime() - now) / 60000),
        };
      }
    );
  } catch {
    return [];
  }
}
