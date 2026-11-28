import { writeFileSync } from 'node:fs';
import { buildAll } from '@atropyle/circuits';
import { ASK_CALLS_FILE, HERO_CIRCUIT_FILE, heroAsk, renderAskCalls, renderHeroCircuit } from './lib/hero-ask';
import { GEOMETRY_FILE, netlistGeometry, renderGeometryModule } from './lib/netlist-layout';

const program = buildAll().program;
const hero = heroAsk(program);
const geometry = netlistGeometry(program, hero.vectors);
writeFileSync(GEOMETRY_FILE, renderGeometryModule(geometry));
writeFileSync(HERO_CIRCUIT_FILE, renderHeroCircuit(geometry, hero));
writeFileSync(ASK_CALLS_FILE, renderAskCalls(hero));
for (const file of [GEOMETRY_FILE, HERO_CIRCUIT_FILE, ASK_CALLS_FILE]) console.log(`geometry: wrote ${file}`);
