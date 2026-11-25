import { writeFileSync } from 'node:fs';
import { buildAll } from '@atropyle/circuits';
import { GEOMETRY_FILE, netlistGeometry, renderGeometryModule } from './lib/netlist-layout';

writeFileSync(GEOMETRY_FILE, renderGeometryModule(netlistGeometry(buildAll().program)));
console.log(`geometry: wrote ${GEOMETRY_FILE}`);
