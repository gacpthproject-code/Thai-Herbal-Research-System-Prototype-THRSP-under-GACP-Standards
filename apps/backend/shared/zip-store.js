'use strict';

/**
 * A ZIP archive of uncompressed ("stored") entries, for handing a set of
 * export files over as one download. Entry times are fixed at 1980-01-01 so
 * the same files always make the same bytes; the files carry their own dates.
 * Names are UTF-8 (general purpose flag bit 11). No ZIP64: each file and the
 * whole archive stay under 4 GiB, far above the research export at pilot scale.
 */

const zlib = require('zlib');

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UTF8_NAMES = 0x0800;
const MAX_BYTES = 0xFFFFFFFF;

/**
 * @param {{ name: string, data: Buffer }[]} entries
 * @returns {Buffer}
 */
function zipStore(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBytes = Buffer.from(name, 'utf8');
        const crc = zlib.crc32(data);
        if (data.length > MAX_BYTES) { throw new Error(`zip entry too large for a non-ZIP64 archive: ${name}`); }

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(UTF8_NAMES, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(UTF8_NAMES, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);

        locals.push(local, nameBytes, data);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + data.length;
    }
    const directory = Buffer.concat(centrals);
    if (offset + directory.length > MAX_BYTES) { throw new Error('zip archive too large for a non-ZIP64 archive'); }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}

module.exports = { zipStore };
