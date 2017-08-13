// @flow
import clone from 'clone';
import { HT_BLOCK, HT_VBAR, HT_HBAR, HT_BOX } from './Types';
import type {
  CellState,
  Direction,
  MoveAction,
  Game,
  GameState,
  StartPosition,
  Warrior,
  WarriorType,
  ZobristHash,
} from './Types';
import assert from 'assert';

import fs from 'fs';

const NO_LR_MIRROR_ALLOW: boolean = true;

const MAX_HERO_COUNT: number = 10;
const MAX_MOVE_DIRECTION: number = 4;
const MAX_WARRIOR_TYPE: number = 5;

const HRD_GAME_ROW: number = 5;
const HRD_GAME_COL: number = 4;
const HRD_BOARD_WIDTH: number = 6;
const HRD_BOARD_HEIGHT: number = 7;

const CAO_ESCAPE_TOP: number = 1; // row
const CAO_ESCAPE_LEFT: number = 3; // col

const BOARD_CELL_EMPTY: number = 0; // 0x00
const BOARD_CELL_BORDER: number = 15; // 0x0F

const directions: Array<Direction> = [{ hd: 0, vd: 1 }, { hd: 1, vd: 0 }, { hd: 0, vd: -1 }, { hd: -1, vd: 0 }];
const directionName: Array<string> = ['Down', 'Right', 'Up', 'Left'];

let zob_hash: ZobristHash;

let count = 0;

let fileText = '';

let level = 0;

export default class Klotski {
  constructor() {}

  isReverseDirection(dirIdx1: number, dirIdx2: number): boolean {
    return (dirIdx1 + 2) % MAX_MOVE_DIRECTION === dirIdx2;
  }

  copyGameState(gameState: GameState): GameState {
    return clone(gameState);
  }

  directionStringFromIndex(dirIdx: number): string {
    //assert(dirIdx >= 0 && dirIdx < MAX_MOVE_DIRECTION);
    if (dirIdx >= 0 && dirIdx < MAX_MOVE_DIRECTION) {
      return directionName[dirIdx];
    }
    return '';
  }

  getHash(state: GameState): number {
    let hash: number = 0;
    const heroes: Array<Warrior> = state.heroes;
    let foundCaoCao: boolean = false;
    let c = 0;

    for (let i = 1; i <= HRD_GAME_ROW; i++) {
      for (let j = 1; j <= HRD_GAME_COL; j++) {
        const index = state.board[i][j] - 1;
        const type = index >= 0 && index < heroes.length ? heroes[index].type : 0;
        const pos = (i - 1) * HRD_GAME_COL + (j - 1);

        if (type === HT_BOX && !foundCaoCao) {
          foundCaoCao = true;
          hash += pos * Math.pow(2, 32);
        } else if (type !== HT_BOX) {
          hash += type * Math.pow(2, c++ * 2);
        }
      }
    }

    return hash;
  }

  isPositionAvailable(state: GameState, type: WarriorType, left: number, top: number): boolean {
    console.log('is available');
    console.log(type, left, top);
    let isOK: boolean = false;

    switch (type) {
      case HT_BLOCK:
        isOK = state.board[left + 1][top + 1] === BOARD_CELL_EMPTY;
        break;
      case HT_VBAR:
        isOK =
          state.board[left + 1][top + 1] === BOARD_CELL_EMPTY && state.board[left + 2][top + 1] === BOARD_CELL_EMPTY;
        break;
      case HT_HBAR:
        isOK =
          state.board[left + 1][top + 1] === BOARD_CELL_EMPTY && state.board[left + 1][top + 2] === BOARD_CELL_EMPTY;
        break;
      case HT_BOX:
        isOK =
          state.board[left + 1][top + 1] === BOARD_CELL_EMPTY &&
          state.board[left + 1][top + 2] === BOARD_CELL_EMPTY &&
          state.board[left + 2][top + 1] === BOARD_CELL_EMPTY &&
          state.board[left + 2][top + 2] === BOARD_CELL_EMPTY;
        break;
      default:
        isOK = false;
        break;
    }

    console.log(isOK);

    return isOK;
  }

  canHeroMove(state: GameState, heroIdx: number, dirIdx: number): boolean {
    let cv1, cv2, cv3, cv4;
    let canMove: boolean = false;
    const hero: Warrior = state.heroes[heroIdx];
    const dir: Direction = directions[dirIdx];

    switch (hero.type) {
      case HT_BLOCK:
        canMove = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 1] == BOARD_CELL_EMPTY;
        break;
      case HT_VBAR:
        cv1 = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 1];
        cv2 = state.board[hero.left + dir.hd + 2][hero.top + dir.vd + 1];
        canMove = (cv1 == BOARD_CELL_EMPTY || cv1 == heroIdx + 1) && (cv2 == BOARD_CELL_EMPTY || cv2 == heroIdx + 1);
        break;
      case HT_HBAR:
        cv1 = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 1];
        cv2 = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 2];
        canMove = (cv1 == BOARD_CELL_EMPTY || cv1 == heroIdx + 1) && (cv2 == BOARD_CELL_EMPTY || cv2 == heroIdx + 1);
        break;
      case HT_BOX:
        cv1 = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 1];
        cv2 = state.board[hero.left + dir.hd + 2][hero.top + dir.vd + 1];
        cv3 = state.board[hero.left + dir.hd + 1][hero.top + dir.vd + 2];
        cv4 = state.board[hero.left + dir.hd + 2][hero.top + dir.vd + 2];
        canMove =
          (cv1 == BOARD_CELL_EMPTY || cv1 == heroIdx + 1) &&
          (cv2 == BOARD_CELL_EMPTY || cv2 == heroIdx + 1) &&
          (cv3 == BOARD_CELL_EMPTY || cv3 == heroIdx + 1) &&
          (cv4 == BOARD_CELL_EMPTY || cv4 == heroIdx + 1);
        break;
      default:
        canMove = false;
        break;
    }

    return canMove;
  }

  clearPosition(state: GameState, type: WarriorType, left: number, top: number) {
    switch (type) {
      case HT_BLOCK:
        state.board[left + 1][top + 1] = BOARD_CELL_EMPTY;
        break;
      case HT_VBAR:
        state.board[left + 1][top + 1] = BOARD_CELL_EMPTY;
        state.board[left + 2][top + 1] = BOARD_CELL_EMPTY;
        break;
      case HT_HBAR:
        state.board[left + 1][top + 1] = BOARD_CELL_EMPTY;
        state.board[left + 1][top + 2] = BOARD_CELL_EMPTY;
        break;
      case HT_BOX:
        state.board[left + 1][top + 1] = BOARD_CELL_EMPTY;
        state.board[left + 1][top + 2] = BOARD_CELL_EMPTY;
        state.board[left + 2][top + 1] = BOARD_CELL_EMPTY;
        state.board[left + 2][top + 2] = BOARD_CELL_EMPTY;
        break;
      default:
        break;
    }
  }

  takePosition(state: GameState, heroIdx: number, type: WarriorType, left: number, top: number) {
    switch (type) {
      case HT_BLOCK:
        state.board[left + 1][top + 1] = heroIdx + 1;
        break;
      case HT_VBAR:
        state.board[left + 1][top + 1] = heroIdx + 1;
        state.board[left + 2][top + 1] = heroIdx + 1;
        break;
      case HT_HBAR:
        state.board[left + 1][top + 1] = heroIdx + 1;
        state.board[left + 1][top + 2] = heroIdx + 1;
        break;
      case HT_BOX:
        state.board[left + 1][top + 1] = heroIdx + 1;
        state.board[left + 1][top + 2] = heroIdx + 1;
        state.board[left + 2][top + 1] = heroIdx + 1;
        state.board[left + 2][top + 2] = heroIdx + 1;
        break;
      default:
        break;
    }
  }

  addGameStateHero(state: GameState, heroIdx: number, hero: Warrior): boolean {
    console.log('hey yo', heroIdx, hero.type, hero.left, hero.top);
    console.log(state.board);
    console.log('---------');
    if (this.isPositionAvailable(state, hero.type, hero.left, hero.top)) {
      this.takePosition(state, heroIdx, hero.type, hero.left, hero.top);
      state.heroes.push(hero);
      return true;
    }
    return false;
  }

  initGameStateBoard(state: GameState) {
    let i, j;

    for (i = 0; i < HRD_BOARD_HEIGHT; i++) {
      state.board[i] = [];
      for (j = 0; j < HRD_BOARD_WIDTH; j++) {
        state.board[i][j] = BOARD_CELL_EMPTY;
      }
    }

    for (i = 0; i < HRD_BOARD_WIDTH; i++) {
      state.board[0][i] = BOARD_CELL_BORDER;
      state.board[HRD_BOARD_HEIGHT - 1][i] = BOARD_CELL_BORDER;
    }

    for (i = 1; i < HRD_BOARD_HEIGHT - 1; i++) {
      state.board[i][0] = BOARD_CELL_BORDER;
      state.board[i][HRD_BOARD_WIDTH - 1] = BOARD_CELL_BORDER;
    }
  }

  initHdrGameState(state: GameState, heroCount: number, heroInfo: Array<number>): boolean {
    this.initGameStateBoard(state);

    state.parent = null;
    state.step = 0;
    state.move.heroIdx = 0;
    state.move.dirIdx = 0;

    for (let i = 0; i < heroCount; i++) {
      const hero: Warrior = {
        type: heroInfo[i * 3],
        left: heroInfo[i * 3 + 1],
        top: heroInfo[i * 3 + 2],
      };

      if (!this.addGameStateHero(state, i, hero)) {
        return false;
      }
    }

    return true;
  }

  initHrdGame(game: Game, start: StartPosition): boolean {
    game.result = 0;
    game.gameName = start.startName;

    for (let i = 0; i < start.heroCount; i++) {
      game.heroNames.push(start.heroName[i]);
    }

    game.caoIdx = start.caoIdx;

    const state = {
      board: [],
      heroes: [],
      move: {
        heroIdx: 0,
        dirIdx: 0,
      },
      step: 0,
      hash: 0,
      parent: null,
    };

    if (this.initHdrGameState(state, start.heroCount, start.heroInfo)) {
      game.states.push(state);
      game.states.push(null);
      return true;
    }

    return false;
  }

  markGameState(game: Game, gameState: GameState) {
    const hash: number = this.getHash(gameState);
    game.zhash[`${hash}`] = true;
  }

  outputMoveRecords(game: Game, gameState: GameState) {
    console.log(`Find Result ${game.result} total ${gameState.step} steps`);

    let state: ?GameState = gameState;
    while (state) {
      if (state.step > 0) {
        const curMove: MoveAction = state.move;
        const curDirection: string = this.directionStringFromIndex(curMove.dirIdx);

        console.log(`Step ${state.step} : ${game.heroNames[curMove.heroIdx]} move ${curDirection}`);
      }

      state = state.parent;
    }
  }

  isEscaped(game: Game, gameState: GameState): boolean {
    console.log(`${gameState.heroes[game.caoIdx - 1].type}, ${gameState.heroes[game.caoIdx - 1].left}, ${gameState.heroes[game.caoIdx - 1].top}`);
    return (
      gameState.heroes[game.caoIdx - 1].left === CAO_ESCAPE_LEFT &&
      gameState.heroes[game.caoIdx - 1].top === CAO_ESCAPE_TOP
    );
  }

  printGameState(gameState: GameState) {
    const hash = this.getHash(gameState);

    console.log(`[${level}] Game state hash : ${hash}`);
    console.log(gameState.board);
    console.log('------------------');

    const heroes = gameState.heroes;
    let str = '';
    for (let i = 0; i < heroes.length; i++) {
      const hero: Warrior = heroes[i];
      str += `${hero.type}, ${hero.left}, ${hero.top},  `; 
    }
    console.log(str);
    console.log('------------------');
  }

  resolveGame(game: Game): boolean {
    while (game.states.length > 0) {
      const gameState: ?GameState = game.states.shift();

      if (gameState) {
        console.log('==============================');
        this.printGameState(gameState);

        this.markGameState(game, gameState);

        if (this.isEscaped(game, gameState)) {
          game.result++;

          this.outputMoveRecords(game, gameState);
          break;
        } else {
          this.searchNewGameStates(game, gameState);
        }
      } else {
        level++;
        console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        if (game.states.length > 0) {
          game.states.push(null);
        }

        if (level > 2) {
          //break;
        }
      }
    }

    return game.result > 0;
  }

  searchNewGameStates(game: Game, gameState: GameState) {
    for (let i = 0; i < gameState.heroes.length; i++) {
      for (let j = 0; j < MAX_MOVE_DIRECTION; j++) {
        this.trySearchHeroNewState(game, gameState, i, j);
      }
    }
  }

  trySearchHeroNewState(game: Game, gameState: GameState, heroIdx: number, dirIdx: number) {
    const newState: ?GameState = this.moveHeroToNewState(gameState, heroIdx, dirIdx);

    if (newState) {
      if (this.addNewStatePattern(game, newState)) {
        this.printGameState(newState);
        this.tryHeroContinueMove(game, newState, heroIdx, dirIdx);
        return;
      }
    }
  }

  moveHeroToNewState(gameState: GameState, heroIdx: number, dirIdx: number): ?GameState {
    if (this.canHeroMove(gameState, heroIdx, dirIdx)) {
      const newState: GameState = this.copyGameState(gameState);
      const hero: Warrior = newState.heroes[heroIdx];
      const dir: Direction = directions[dirIdx];

      this.clearPosition(newState, hero.type, hero.left, hero.top);
      this.takePosition(newState, heroIdx, hero.type, hero.left + dir.hd, hero.top + dir.vd);

      hero.left = hero.left + dir.hd;
      hero.top = hero.top + dir.vd;

      newState.heroes[heroIdx] = hero;

      newState.step = gameState.step + 1;
      newState.parent = gameState;
      newState.move.heroIdx = heroIdx;
      newState.move.dirIdx = dirIdx;

      return newState;
    }

    return null;
  }

  addNewStatePattern(game: Game, gameState: GameState): boolean {
    const hash: number = this.getHash(gameState);

    if (game.zhash[`${hash}`]) {
      return false;
    }

    game.zhash[`${hash}`] = true;
    game.states.push(gameState);

    return true;
  }

  tryHeroContinueMove(game: Game, gameState: GameState, heroIdx: number, lastDirIdx: number) {
    for (let d = 0; d < MAX_MOVE_DIRECTION; d++) {
      if (!this.isReverseDirection(d, lastDirIdx)) {
        const newState: ?GameState = this.moveHeroToNewState(gameState, heroIdx, d);
        if (newState) {
          if (this.addNewStatePattern(game, newState)) {
            newState.step--;
          } else {
            return;
          }
        }
      }
    }
  }

  releseGame(game: Game) {}

  solve(start: StartPosition): number {
    const game: Game = {
      gameName: '',
      heroNames: [],
      caoIdx: 0,
      states: [],
      zhash: {},
      result: 0,
    };

    if (this.initHrdGame(game, start)) {
      console.log(`Find result for layout : ${game.gameName}`);

      if (this.resolveGame(game)) {
        console.log(`Find ${game.result} result(s) totally!`);
      } else {
        console.log(`Not find result for this layout!`);
      }

      this.releseGame(game);
    }

    return 0;
  }
}