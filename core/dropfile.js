/* jslint node: true */
'use strict';

//  ENiGMA½
const Config        = require('./config.js').get;
const StatLog       = require('./stat_log.js');

//  deps
const fs            = require('graceful-fs');
const paths         = require('path');
const _             = require('lodash');
const moment        = require('moment');
const iconv         = require('iconv-lite');
const { mkdirs }    = require('fs-extra');

//
//  Resources
//  * http://goldfndr.home.mindspring.com/dropfile/
//  * https://en.wikipedia.org/wiki/Talk%3ADropfile
//  * http://thoughtproject.com/libraries/bbs/Sysop/Doors/DropFiles/index.htm
//  * http://thebbs.org/bbsfaq/ch06.02.htm
//  * http://lord.lordlegacy.com/dosemu/
//
module.exports = class DropFile {
    constructor(client, { fileType = 'DORINFO', baseDir = Config().paths.dropFiles } = {} ) {
        this.client             = client;
        this.fileType           = fileType.toUpperCase();
        this.baseDir            = baseDir;
    }

    get fullPath() {
        return paths.join(this.baseDir, ('node' + this.client.node), this.fileName);
    }

    get fileName() {
        return {
            DOOR            : 'DOOR.SYS',                   //  GAP BBS, many others
            DOOR32          : 'DOOR32.SYS',                 //  EleBBS / Mystic, Syncronet, Maximus, Telegard, AdeptXBBS, ...
            CALLINFO        : 'CALLINFO.BBS',               //  Citadel?
            DORINFO         : this.getDoorInfoFileName(),   //  RBBS, RemoteAccess, QBBS, ...
            CHAIN           : 'CHAIN.TXT',                  //  WWIV
            CURRUSER        : 'CURRUSER.BBS',               //  RyBBS
            SFDOORS         : 'SFDOORS.DAT',                //  Spitfire
            PCBOARD         : 'PCBOARD.SYS',                //  PCBoard
            TRIBBS          : 'TRIBBS.SYS',                 //  TriBBS
            USERINFO        : 'USERINFO.DAT',               //  Wildcat! 3.0+
            JUMPER          : 'JUMPER.DAT',                 //  2AM BBS
            SXDOOR          : 'SXDOOR.' + _.pad(this.client.node.toString(), 3, '0'),   //  System/X, dESiRE
            INFO            : 'INFO.BBS',                   //  Phoenix BBS
        }[this.fileType];
    }

    isSupported() {
        return this.getHandler() ? true : false;
    }

    getHandler() {
        return {
            DOOR        : this.getDoorSysBuffer,
            DOOR32      : this.getDoor32Buffer,
            DORINFO     : this.getDoorInfoDefBuffer,
        }[this.fileType];
    }

    getContents() {
        const handler = this.getHandler().bind(this);
        return handler();
    }

    getDoorInfoFileName() {
        let x;
        const node = this.client.node;
        if(10 === node) {
            x = 0;
        } else if(node < 10) {
            x = node;
        } else {
            x = String.fromCharCode('a'.charCodeAt(0) + (node - 11));
        }
        return 'DORINFO' + x + '.DEF';
    }

    getDoorSysBuffer() {
        const prop      = this.client.user.properties;
        const now       = moment();
        const secLevel  = this.client.user.getLegacySecurityLevel().toString();

        //  :TODO: fix time remaining
        //  :TODO: fix default protocol -- user prop: transfer_protocol
        return iconv.encode( [
            'COM1:',                                            //  "Comm Port - COM0: = LOCAL MODE"
            '57600',                                            //  "Baud Rate - 300 to 38400" (Note: set as 57600 instead!)
            '8',                                                //  "Parity - 7 or 8"
            this.client.node.toString(),                        //  "Node Number - 1 to 99"
            '57600',                                            //  "DTE Rate. Actual BPS rate to use. (kg)"
            'Y',                                                //  "Screen Display - Y=On  N=Off             (Default to Y)"
            'Y',                                                //  "Printer Toggle - Y=On  N=Off             (Default to Y)"
            'Y',                                                //  "Page Bell      - Y=On  N=Off             (Default to Y)"
            'Y',                                                //  "Caller Alarm   - Y=On  N=Off             (Default to Y)"
            prop.real_name || this.client.user.username,        //  "User Full Name"
            prop.location || 'Anywhere',                        //  "Calling From"
            '123-456-7890',                                     //  "Home Phone"
            '123-456-7890',                                     //  "Work/Data Phone"
            'NOPE',                                             //  "Password" (Note: this is never given out or even stored plaintext)
            secLevel,                                           //  "Security Level"
            prop.login_count.toString(),                        //  "Total Times On"
            now.format('MM/DD/YY'),                             //  "Last Date Called"
            '15360',                                            //  "Seconds Remaining THIS call (for those that particular)"
            '256',                                              //  "Minutes Remaining THIS call"
            'GR',                                               //  "Graphics Mode - GR=Graph, NG=Non-Graph, 7E=7,E Caller"
            this.client.term.termHeight.toString(),             //  "Page Length"
            'N',                                                //  "User Mode - Y = Expert, N = Novice"
            '1,2,3,4,5,6,7',                                    //  "Conferences/Forums Registered In  (ABCDEFG)"
            '1',                                                //  "Conference Exited To DOOR From    (G)"
            '01/01/99',                                         //  "User Expiration Date              (mm/dd/yy)"
            this.client.user.userId.toString(),                 //  "User File's Record Number"
            'Z',                                                //  "Default Protocol - X, C, Y, G, I, N, Etc."
            //  :TODO: fix up, down, etc. form user properties
            '0',                                                //  "Total Uploads"
            '0',                                                //  "Total Downloads"
            '0',                                                //  "Daily Download "K" Total"
            '999999',                                           //  "Daily Download Max. "K" Limit"
            moment(prop.birthdate).format('MM/DD/YY'),          //  "Caller's Birthdate"
            'X:\\MAIN\\',                                       //  "Path to the MAIN directory (where User File is)"
            'X:\\GEN\\',                                        //  "Path to the GEN directory"
            StatLog.getSystemStat('sysop_username'),            //  "Sysop's Name (name BBS refers to Sysop as)"
            this.client.user.username,                          //  "Alias name"
            '00:05',                                            //  "Event time                        (hh:mm)" (note: wat?)
            'Y',                                                //  "If its an error correcting connection (Y/N)"
            'Y',                                                //  "ANSI supported & caller using NG mode (Y/N)"
            'Y',                                                //  "Use Record Locking                    (Y/N)"
            '7',                                                //  "BBS Default Color (Standard IBM color code, ie, 1-15)"
            //  :TODO: fix minutes here also:
            '256',                                              //  "Time Credits In Minutes (positive/negative)"
            '07/07/90',                                         //  "Last New Files Scan Date          (mm/dd/yy)"
            //  :TODO: fix last vs now times:
            now.format('hh:mm'),                                //  "Time of This Call"
            now.format('hh:mm'),                                //  "Time of Last Call                 (hh:mm)"
            '9999',                                             //  "Maximum daily files available"
            //  :TODO: fix these stats:
            '0',                                                //  "Files d/led so far today"          
            '0',                                                //  "Total "K" Bytes Uploaded"
            '0',                                                //  "Total "K" Bytes Downloaded"
            prop.user_comment || 'None',                        //  "User Comment"
            '0',                                                //  "Total Doors Opened"
            '0',                                                //  "Total Messages Left"

        ].join('\r\n') + '\r\n', 'cp437');
    }

    getDoor32Buffer() {
        //
        //  Resources:
        //  * http://wiki.bbses.info/index.php/DOOR32.SYS
        //
        //  :TODO: local/serial/telnet need to be configurable -- which also changes socket handle!
        const Door32CommTypes = {
            Local   : 0,
            Serial  : 1,
            Telnet  : 2,
        };

        const commType = Door32CommTypes.Telnet;

        return iconv.encode([
            commType.toString(),
            '-1',
            '115200',
            Config().general.boardName,
            this.client.user.userId.toString(),
            this.client.user.properties.real_name || this.client.user.username,
            this.client.user.username,
            this.client.user.getLegacySecurityLevel().toString(),
            '546',  //  :TODO: Minutes left!
            '1',    //  ANSI
            this.client.node.toString(),
        ].join('\r\n') + '\r\n', 'cp437');
    }

    getDoorInfoDefBuffer() {
        //  :TODO: fix time remaining

        //
        //  Resources:
        //  * http://goldfndr.home.mindspring.com/dropfile/dorinfo.htm
        //
        //  Note that usernames are just used for first/last names here
        //
        const opUserName    = /[^\s]*/.exec(StatLog.getSystemStat('sysop_username'))[0];
        const userName      = /[^\s]*/.exec(this.client.user.username)[0];
        const secLevel      = this.client.user.getLegacySecurityLevel().toString();

        return iconv.encode( [
            Config().general.boardName,                         //  "The name of the system."
            opUserName,                                         //  "The sysop's name up to the first space."
            opUserName,                                         //  "The sysop's name following the first space."
            'COM1',                                             //  "The serial port the modem is connected to, or 0 if logged in on console."
            '57600',                                            //  "The current port (DTE) rate."
            '0',                                                //  "The number "0""
            userName,                                           //  "The current user's name, up to the first space."
            userName,                                           //  "The current user's name, following the first space."
            this.client.user.properties.location || '',         //  "Where the user lives, or a blank line if unknown."
            '1',                                                //  "The number "0" if TTY, or "1" if ANSI."
            secLevel,                                           //  "The number 5 for problem users, 30 for regular users, 80 for Aides, and 100 for Sysops."
            '546',                                              //  "The number of minutes left in the current user's account, limited to 546 to keep from overflowing other software."
            '-1'                                                //  "The number "-1" if using an external serial driver or "0" if using internal serial routines."
        ].join('\r\n') + '\r\n', 'cp437');
    }

    createFile(cb) {
        mkdirs(paths.dirname(this.fullPath), err => {
            if(err) {
                return cb(err);
            }
            return fs.writeFile(this.fullPath, this.getContents(), cb);
        });
    }
};
