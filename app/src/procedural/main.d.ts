export interface ProceduralWorld {
  dispose?: () => void;
}

export function initGamescomScene(options?: { container?: HTMLElement }): Promise<ProceduralWorld>;
