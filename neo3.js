const fs = require('fs');
const { PNG } = require('pngjs');

const FILE_INPUT = 'verification-5.png';
const AMBANG_WARNA = 110;
const LUAS_MINIMUM = 10;
const UKURAN = 64;
const ROTASI_MIN = -45;
const ROTASI_MAX = 45;
const ROTASI_STEP = 3;
const AMBANG_COCOK = 0.45;


const TEMPLATES = {
    J: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAZCAYAAADe1WXtAAAAg0lEQVR4AbXBQZKDMAADwZEq//+yVgcfUpTZAMbdYkGKQcUgFqSYMC9TmYdSnDAbmA3Mi1SU2cA8kOIfZgOzgXmJisHclOKHD5ViULHIKb5kYIF5gYov5oYUF5gJFQvMRIoF5qIUEyoORKV4SMWB2UAMKW5SMSEOUlyg4oQ4kWJCxQ9/VpFAHzkkTOUAAAAASUVORK5CYII=",
    K: "iVBORw0KGgoAAAANSUhEUgAAABsAAAAfCAYAAAAWRbZDAAAAwklEQVR4Ab3BSY6EQBAEQY8U//9yjh84IFRUsw1mYafFQMRDxYeKf9BiYOFlLdRiZ+ElLSaiYqPFDS0mIlScEHGgxUTEqnigxUTExsJNLQ5EDCxc1GIi4kBxQYuJiInipBYTET+EVYsbIk4qHoi4oPhQ8UCLC4oPFSdFDLQ4KaxaDERstBiI+KFQi4GIFxUXRQy0+KH4UPGiFhPFDRE3FDdFDLQ4UC0GIl5WPBAx0GKgIj4SXtBiIGKj+FB4UYudiNUftOxoOtVWtw4AAAAASUVORK5CYII=",
    Q: "iVBORw0KGgoAAAANSUhEUgAAABcAAAAaCAYAAABctMd+AAAAqklEQVR4AbXBUY6DMBAFwX5z/ztPeiV/IGSbTYAqvtHiC2GjxYWIhTDR4ksRJ+GkxY8iDsJBi5sihjC0WIg4aLERoaAWExEbLSYiVCxEXIiYaKFqcUPEQjERcVOreEDERPGi4kXFi4oXFQ9oMVH8oAc2omKixUKLocVGRUy0+IcWC8VGi5OICxEKQ4sHRAzFEPGwcNLipgiFhRY35A8XWixEDC0OIp7UA8MH+ihwEy9/tQ8AAAAASUVORK5CYII=",
    R: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAaCAYAAABYQRdDAAAAfElEQVR4AbXBQQ6EMBADwbbF/78860MOCGVBhEyViApeUHBDRAUfKRjMJhUMZqMKwvyhgQUiKrhQ8KCCCdPAfKBgwjQwH1RwoTANVMEmCsI0ONhAwYnZoIITVXChYKKCGwrCvKCBB2aBghumgWlgGpgGpoFpYBqIRRVMKH54tTA99zSSWQAAAABJRU5ErkJggg==",
    Y: "iVBORw0KGgoAAAANSUhEUgAAABcAAAAeCAYAAADHJYVoAAAApElEQVR4AbXBQZICMRADwZL248vLGx04TBC2sWE6UxW8UXADM1DBDcxEBT8SUcGAgg8qmDCNzEIFCxVMKEwoaGC+VMGEghAXFQwouKhgQsGLaWQOVTCh4MJcKFioYELBG7OhggUFA2ZTBYfEQAWbFEyYHyhYMI3ERAULCj4wX1CwwRxSsMk0Mo1MI9PIDFRwA3NAwQHTyDQyjf4YeLz8BxeP4MAT/WlMRb1KZAUAAAAASUVORK5CYII=",
    M: "iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAAh0lEQVR4Ab3BORaDMBAFwZ7/uP+Vxx04ILBYBFZV8VCLgRLaUIuBEg+lxaQWF4QFwokWk1ooJf4sLBAuaPFAmNRip8RAWCAMlNhpMSksEBYIB0rstPihxIGwQJjQ4oZwosRD4aYWN4WBFi9ohQWCShwoMVDiRHhRiR/CAhsXlVqcKDHSX/zBB8E7RChKcCZQAAAAAElFTkSuQmCC",
    F: "iVBORw0KGgoAAAANSUhEUgAAABMAAAAdCAYAAABIWle8AAAAYUlEQVR4Aa3BgQnEMBDEQN3i/lu+3xSQgHnNYNiihhdbXJotJEEURAfBFHV4McWlIAqiIAqiINiihtriT/OgthAEURAdBFPU4cMUF4IoiIIoiIIoiEJNIQgftrgQREEURD/GPxw5j8j/OQAAAABJRU5ErkJggg==",
    E: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAdCAYAAABFRCf7AAAAVElEQVR4AbXBQQ4CMQzAQMfa/3+5BInrXlA9w9f54ZI5i8skIAEJSODhxSz+JAEJSEACEpizuGiWBCQgAQk8vJjFnyQgAQlIQAISmLO4TAISkIAEPugmFDJzUAT9AAAAAElFTkSuQmCC",
    
        O: "iVBORw0KGgoAAAANSUhEUgAAABkAAAAaCAYAAABCfffNAAAArUlEQVR4Ab3BQQ6DMBAEwZ79/583fcgBWTZYgVAVNrUYRGwIJ1psilgIEy1+FDEIgxY3RRyEgxYPifgKBy0WIgYtTkQofLWYiLjQYiJCxYmIDRETLVSoxU0RC8VCxANaxQuqxUMiJooXFC8oXlARf1Y8qMVEsdDiIcWfRYUiJlpsarFQXGhxocVEhMJBixMRBy1ORCgMWjwg4itMtLgh4iAstPhBxCBcaLEhYuED3XdkJQq4CZsAAAAASUVORK5CYII=",
    A: "iVBORw0KGgoAAAANSUhEUgAAABgAAAAbCAYAAABm409WAAAAnklEQVR4AbXBQQ7DIBRDwfet3v/KrhdZRAgaSGGmWOBgoIIOcZiY5OAFsYmDDjHBwUviMPHAwR/ECxV0OGiIHxwMVDBBLKpggRhwsIE4THQ46KjggYMb8YcKHoiGg44KXhAHOLgUNw42qSDEYeIwcXFwQHFx0KjgxsGCig/hYEIFDQc/iIEKJtSFATk4qAgHNxUsctBRbOKgo9jIQeMLVglcE3TZZdEAAAAASUVORK5CYII=",
    I: "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAXCAYAAAA2jw7FAAAAR0lEQVR4AYXBwQ2AQBDDQK/773nJg8fphMjMbHCY4CCFXDY4SCGFFFI4wQ/5sMFLCimkkGJ4bXCZkEIKKaSQYjhscJFCCikezVoUJK6AQdMAAAAASUVORK5CYII=",
    U: "iVBORw0KGgoAAAANSUhEUgAAABMAAAAYCAYAAAAYl8YPAAAAZElEQVR4Aa3BQQ7CMBRDwWff/84fV8oCRaEV4BlNsFHwYIKNKTJFpsgUmSJTZIpMkSkyRabIFJkiU2SKTJEpMgcT3JjgQBPcULBM8IEuxAR/0oVlgh8pCPFmgi8pWMTBBA8UbF4Dligfz9c27wAAAABJRU5ErkJggg==",
        H: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAYCAYAAAD6S912AAAAXElEQVR4Aa3BQQqEQBAEwezE/3+5t44iAy5SEUNscDPBiw0eJtygSMqkTMqkTMqkTMouDjb4SMqkTMqk7OJgghcbHEiZlEnRhpRJmZRJmRxs8NEQG9xM8IcNbiZ+DQIkIxQMRfIAAAAASUVORK5CYII=",
    S: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAoklEQVR4Aa3BQQ7DIBAEwR7+/+dNR+JgISDYTlXYKLEQsRAmStwQcREGJR6I6MJFiRciFC5KTER0JTbyRVdiImKhxERjI2IjYqKxUeKBxg8lbgoXJTYiDoRBiQMRC2GixKGIQdgocSiiCwdKHIhQuKnERr5KDCJ+KDERNR6KWGhMlHihRfxZY6E6FkoshK7ESxFqdBF/EgYlHojowkKJAxGDDzsiZBndoZt2AAAAAElFTkSuQmCC",
    V: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAbCAYAAACTHcTmAAAAjElEQVR4AbXBQRKEIBRDwZfU3P/Kf7JwYVGoINItFlXQEAsq6DAfU/wqaChYYDoqWGA2sIKOCl4yoeBD5kYFL5iDgkUKwjyoYJI5UTCoggtmQAUTTEPBIjOogkGmQ8ECc0FBo4ILCg5mA3NDQaOCB2YDMaCCBwoOZgMzQMEEs4GYUEGHghOzgZmgYMAf6mI4PRHAPtIAAAAASUVORK5CYII=",
        P: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAbCAYAAAB836/YAAAAcklEQVR4Aa3BMRIEIQwDwbGK/3/Zp2ADArjAqLvaeFDGRjxqYyMC2viIkDas2ghaXJTxRxsHIkyEiaEyDsRQGwciTAy0cVFYGwFlIkyElGGLR2VsFkNlHCwuyhgQYSJMXLQxIMJEmAgTYSKs+LSxKWPgByf7LDNiF5gVAAAAAElFTkSuQmCC",
    W: "iVBORw0KGgoAAAANSUhEUgAAAB8AAAAcCAYAAACZOmSXAAAArElEQVR4AcXBQQ6EMBADwbbF/7886wOHKAI2oASqxEsq6JgPbTxQwQEFN2xEBR0Fk1RwwBV8xAomqWCQwpyoYDETCj5gJqtgkLlQQaeChoKHzE7By8wEChoVDDANBZ0KJlMQ5kOmo+ABBY0K/jADKljALFbBCXNAwQMKGhVcMIMq6Ci4ScHOnFCwmLmhgj8UDDIfMhcULGQWUDDA/KFgEfMiBY2NRRTMUjsm+gHkn1BIUaJUPwAAAABJRU5ErkJggg==",
    /*
    B: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAbCAYAAACTHcTmAAAAj0lEQVR4AbXBQRKDMBADwZGK/395owMHV8oOwSzd4ksFCwr+oAo2KZhQBQ8pGJgGFQxMkwpOBwsKJiq4YG5ScMFsUDBRQZgXmA0VTCgIc1MFF1RBAwUn00DBwDSoYGCaVHAyjSqIgwUFP1SwYDYpmKgwLzAvMJsqWDAbKvhBFTRSmBeYRgrioIGCwcEDCiY++n9ILvlJrygAAAAASUVORK5CYII=",
    
    */
        D: "iVBORw0KGgoAAAANSUhEUgAAABkAAAAcCAYAAACUJBTQAAAAo0lEQVR4Ab3BSQ6DQBAEwawW//9yOw8ckMUyrBFc0TMGhQ0tTopYEdTiIRF/0uJhEQsV8bKgFgciFlrsiJgFtVgRcaDFhggVN0UcKB4QsaNQxAtaqPhAsaPFoIgNxQeKDxSziBe0ig8UB1rcVLwsKj5QPKTFhmIh4oIWKyJUDGixomccmDihxaCIWTGoxUUTD4v4E1a0OCliw8QNEQMmBkVc9ANaNVQ5WUYODwAAAABJRU5ErkJggg==",
    G: "iVBORw0KGgoAAAANSUhEUgAAABoAAAAcCAYAAAB/E6/TAAAArklEQVR4Ab3BSY7DMBAEwayG///lnjzoYAiitqEZEW5qMRBxIZxo8VDEgTDQ4qWInbDTYpKITfjSYrIIfXgoYtPiprBpMRBxocVAVKjFQMQNESeKExGTFBNFDKTFgYiJikWKRT681OKmqFigVSxSLFIskhYDEQ+1OFARCxQnWkxSXGhxU4uBsGlxImKgxYXwpcUPRMWXiB8pdiL+IeJAcSDihYiBcKHFhYidFpvoDzxoWD7A9miHAAAAAElFTkSuQmCC",
        N: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAYCAYAAAD6S912AAAAgElEQVR4Aa3ByQ0DMRADwSbh/FMe87lY6BjZqhJ/qOBB8algQMFCBQNmooJDFeYys1DBIXOZ2ajggGmooMlcZgYUvFTQYCYU/MAcqGDDLCh4qWDBXGY2FLxUMGEaFDSZy0yTggZzQMGGucwMVDChYMFcZn6gYEJEBQ8KGip4UHwBgHI8KbOYgd0AAAAASUVORK5CYII=",
    T: "iVBORw0KGgoAAAANSUhEUgAAABMAAAAZCAYAAADTyxWqAAAASElEQVR4Aa3BsQ3AMAzAMFn//5x6LtCgg8g5i59mcTFnEZGQhCQ0XJzFyyw+SEhCEpKQhCQkIQlJSEISkpCEJCQhCUlIQhJ6ABNNDCzU0gypAAAAAElFTkSuQmCC",
        Z: "iVBORw0KGgoAAAANSUhEUgAAABcAAAAcCAYAAACK7SRjAAAAmklEQVR4AbXBQY7FIAxEwdeW739lTy/+YoRIggmp4oT6YZA0lNGQDMo4JMv4SMj4SPCh5IaMiTIGMgaiqYwJGYPgABkTQUMZDcFLMi4Ei8poCl6QcSNYUMaGYJOMB8GDMjaJG2VMyFgQNMlYFFwo46WgQUZDMFHGAckiGTfK+EeWDMq4UEaDGJRxSPCh5DAZP8kmGQ+SBzI2/QF2Ikg+WEOXmgAAAABJRU5ErkJggg==",
            C: "iVBORw0KGgoAAAANSUhEUgAAABcAAAAZCAYAAADaILXQAAAAoklEQVR4AbXBQRKDIBQFwXmU97/yzyxYUBZoEqU73CixEHEhLJT4UsREOCnxh4iTMCjxQMQgdCVeENEdqMRCxESJG40LEQsREyW6lJiI+EIJRZwcPBSx0JiIeEFjo8ZGjY0aG6XERMSPSgwOXlBiokVs0lgo8UDU2KihiIkSN0oshK7EhYiuxIUIhUGJhyK6cFLiTxGDMFHiRxEn4UKJGxELHx2jWC0xJQasAAAAAElFTkSuQmCC",
                X: "iVBORw0KGgoAAAANSUhEUgAAABYAAAAbCAYAAAB4Kn/lAAAAtElEQVR4AbXBQRLCQAwEsR7//8+mDxxSW14ISZCCWgwiTmixCG8tBhEftBgUN7TYCActBhGLFhtR8bAIFQcRgxY/KhYRX7QYRLwVJ7VQi0HEQdho8YOIg+IBEYtiI+KG4qaIQfiixUbERvEnxQctLipuaLERNlqcFLEo/qQYtBhEDFosikWLQYQiTige0uIgHLQYRCxaDCJUvLUYRFxQXBQxaKFCLQYRF6XFRsQXLQbhAS0WL6oWcB5KCtuNAAAAAElFTkSuQmCC",
                L: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAcCAYAAACOGPReAAAAXUlEQVR4AbXBMQ7DMBAEsbmB//9lZYuUsY0IWnJW8MMEm6RACuTGCjZJgRMcJgVSIAVSIAVSIAVSIAVSIAVSIA9WsEFigoOkQAou/rSCF8PXCg6RAimQgotNE9z4AGtuFDfUL71OAAAAAElFTkSuQmCC",
                    5: "iVBORw0KGgoAAAANSUhEUgAAABcAAAAcCAYAAACK7SRjAAAAuklEQVR4AbXBQZKDMBAEwWotD1+/fFwHHQgFIMCQGXaUWIm4KOwoMRFxIOwocUNEFzaUeEDjRY2XRI0L0nHSwkkRXcSgxCAMSmyIuCgMSpwQMREGJS6K2NB4QIkNjYeUGDQeVGIlDEoRO0pMROiPwUcc+OhfHPgIhZtKHIgaL2rcFDGxoBJdxAklJhqDEj+K0MKGEl3EoMQJKfGwCAWVeEhEF7oSP4pYCYMSN0QMwoESJ0RsCBeU6CImvvmabDnL2KnlAAAAAElFTkSuQmCC",
    7: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAbCAYAAAB836/YAAAAfElEQVR4Aa3BUQ7DIBBDwWff/85bV+pHFQUCZGfEogoWqIJGpplpZpqZRvpiUwUDCtNEQZgNFTwwzUwDBT9mUQULTDOxoIIBBX9MM/OCggvzoIIN5pCCG2aigk2mmTmgYMAMVHDANBNRwSIFE+JGBQMKJswGBQ/MRQUvfADMNTAt9h/4KwAAAABJRU5ErkJggg==",
        j: "iVBORw0KGgoAAAANSUhEUgAAAA0AAAAiCAYAAACEEVOfAAAAe0lEQVR4AZ3BMQ7EIAADwbWV/3+Zc0GBkHIQz4gXI5gULMQ0gj8UTGZScMkUTMEUTMEUTMEUTMFcGsFkFgoumIIpmIIpmA9GEOYDBWEKpiA2IzgwHynMRsGBKZiCKZjNCA7EYgR/KIhnBB+ZSwomc0HBwhwo2Dy8UPDiB4iGIFV0hgtZAAAAAElFTkSuQmCC",
            2: "iVBORw0KGgoAAAANSUhEUgAAABUAAAAcCAYAAACOGPReAAAAqElEQVR4AbXBQU7DQAAEwR7Dw8nLh0baQxTF3rVxqsKOih0RB8KTipMiXoQnFRdFDBs3qRjCUHGD/GGoeCNiqFgQhgpFTFQcCBdV7Nj4gI0P2PiAcEHFjmjjpIqJcELFgQiFRRUHIoZvJipOCgcqJiJehDcqJiJ2hKFiUcSBoIoFEQtSsSBiUSpOiJhIxU0itHGjCm3cKEJfj+FH/NNDKCyqmIi4U8XwC5nlbBj32Pi8AAAAAElFTkSuQmCC",
            /*
              8: "iVBORw0KGgoAAAANSUhEUgAAABMAAAAcCAYAAACDBoQZAAAArUlEQVR4Aa3BQY6kMAAEwSyr///l2jz4gBBmMUNEWKhYiLgQTioeijgIBxWbIqYwVbwUocEHKvRDFRciTioWBpsiFgYLEZsGCxWbBpsqFgY3Kh6IUJgqXopQOKjYFDGFk4qHIg7CQcULEQpTxR9EP1RxIeKg4kZQxUnEhYqFUbEhYmHwocGHBh8KqrgQcVJxIfpxo2JDmCpeilA4qNgUMYWTiociDsJ/VEwRN/4B0JJsHI/UtYcAAAAASUVORK5CYII=",
   */
    8: "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAsCAYAAABygggEAAABFUlEQVR4AcXBUY6jQBAFwXx1/zvX5kr9gRA2DdOYiHBBixMRE8KJFjdEfBG+aPFHEQfCgRaLRWyEnRYPiRiKjRY/UvxQi6EYWlyQgZvC0GJCxActJkSFWkyI+CJiUjEpYqHiJcVLipcUk1osVCzU4kSECkVM6IEFihta7LQ4ETGEjRYPihjCTosHRGyEAy0WiTgQPmixSMROONBisYiNsNPiIRFD2GjxsAiFocWEiKHFDVFxQcRGBm4IajEh4osWk4pJESciJhWLRUyoFiciFiteUrykmNBisYpYqMWEYlKLEy0mBbW4IGKjxQX5j6HFj0TFj0UobLR4UMQQdlo8IGIjHGixUMRO+KLFH0R8ECa1mBAx4R/iw6RHlhOUeQAAAABJRU5ErkJggg==",
    B: "iVBORw0KGgoAAAANSUhEUgAAACEAAAArCAYAAAD2f+EJAAAA2ElEQVR4Ac3BQZLDIBRDwScV97/yHy28cKUyCTgG0y2igpsp6KQKJlPwgSpYRMEbZqEK3jCLVfDCPKCCE7MBVfCFgg8quEBBNG6g4FDBIHMzBYPMBAoGmA2YDZgNmAkqGGBuVkEHBYfGDyq4gSpYTMGJWUzBC7OQgjdUwWIKTswDKjgxD6ngYB5UQTQ6KOhUwSBV8IWCQRV0MpMo6GQ2YDZgNmA2YDZgJqmgk5mgggGNm1RwgaLRoYKJzIMUhNmAeYiCQ2MxBS8aiyj4R2MyBV+IDyoYoOCCP/GwZFcUUfttAAAAAElFTkSuQmCC",

    
    4: "iVBORw0KGgoAAAANSUhEUgAAABYAAAAbCAYAAAB4Kn/lAAAAiElEQVR4AbXBSQ7DMBADwR7C//8yw0MOguBV9lQVNzk4UMGkuMHBhQoGoom44GCBOOFgkWgiDjh4QexwMKngAdFETBxMKnhIXKhggRg4+Ij4czCpYJE4UMELIhx8TA4mFby0cYODCw4G5aCBaCKaiCYbH6lgUDzkYEcFA9FENBEfcTDYWFTBiR8vG0Al+1f+UgAAAABJRU5ErkJggg==",
        1: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAqCAYAAACz+XvQAAAAiklEQVR4Aa3BQQ7CMBRDwWer97/yx4suKiRIAp4RP5jgA3Fogi/EgQkWxIYJNomFCQ6IDyb4gXgzwR/EbYICTVBkykyZiAlKzCYFGy4WFBwQtwkeFLyZYOHiQcGfxIEJFkyZKTNlpsyUmTJTZspMmSkzZabMlJkyU2bKTJkpM2WmzJSZMlNmykzZCxUpNClG2MVAAAAAAElFTkSuQmCC",
    3: "iVBORw0KGgoAAAANSUhEUgAAAB0AAAAsCAYAAACZtbMHAAAA8UlEQVR4AcXBUW7CQBAFwX4TDg4nn3Qkf1iI4EV411VhQIsDEYPCCy2+EPFG2GlxoogXglpMEvGkmKzFk7BpMVHEprhA2GkxUYRuHIh4o8WHfth56C4UPcSBh+5iwEMonKTFgQgVC7VQcYFioQgVFyhO0OID4UstBkRsbrzRYoJigYidYrKIJ8VEES+EN1qcIGKnWKDFTrFIi02xUAuFL7X4QP5wkhaDwolaDAgna3GguEBxgeICxQXCiVoMKDYtvtBiUNi02IkY1GJQ/qAWi0TFBYqFIlQsErFJi8kidorJIp6ETYsTRfwj/KPFhyIG/AJ4rIRHRn1zLwAAAABJRU5ErkJggg==",
    9: "iVBORw0KGgoAAAANSUhEUgAAAB8AAAArCAYAAACARVOCAAABAklEQVR4AcXBUY6jMBRFwXPdLLyz8jdnJD4QCo0hdqgKnUqciLggnChxQ8SJcKDEABEHwhslBop4I+yUmCBiJ2yUmChiI6xKfEHEqvGgoBKdIt4o0SlCjQsiDkRc1OgUcSKiQwk1HtRKDBTRqdEhYoLGgxodSkzQeEipRTyk0anEYI0LSgwUVOKmqMQNYVXiy8JGiS+JGg9qbER80Q87r9WvmOilHw68Vr9igpfCRSV2IlYlOuQ/BitxIkKNgUpc0HhQGKREh4jVwodK3BQ+UOKCiI1wQ4mLInYW/lBiorBRYoKIN8JOiYEiDixMEnGiMUFEh4WBIi5Y+FDETQs3RAzwD3+uiHMTLqWtAAAAAElFTkSuQmCC",
};


// Baca gambar PNG
function bacaPNG(buffer) {
    return PNG.sync.read(buffer);
}

function jarakWarna(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];

    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Ambil warna latar dari empat sudut gambar
function deteksiLatar(img) {
    const titik = [
        [0, 0],
        [img.width - 1, 0],
        [0, img.height - 1],
        [img.width - 1, img.height - 1]
    ];

    const warna = titik.map(([x, y]) => {
        const i = (y * img.width + x) * 4;
        return [
            img.data[i],
            img.data[i + 1],
            img.data[i + 2]
        ];
    });

    return [0, 1, 2].map(c =>
        Math.round(warna.reduce((s, w) => s + w[c], 0) / 4)
    );
}

// Segmentasi piksel yang berbeda dari warna latar
function segmentasi(img, latar) {
    const { width, height, data } = img;
    const mask = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;

            if (data[i + 3] === 0) continue;

            const d = jarakWarna(
                [data[i], data[i + 1], data[i + 2]],
                latar
            );

            if (d > AMBANG_WARNA) {
                mask[y * width + x] = 1;
            }
        }
    }

    return mask;
}

// Cari komponen terhubung menggunakan BFS
function cariObjek(mask, width, height) {
    const dikunjungi = new Uint8Array(mask.length);
    const objek = [];

    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

    for (let awal = 0; awal < mask.length; awal++) {
        if (!mask[awal] || dikunjungi[awal]) continue;

        const antrean = [awal];
        dikunjungi[awal] = 1;

        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        const piksel = [];

        for (let q = 0; q < antrean.length; q++) {
            const pos = antrean[q];
            const x = pos % width;
            const y = Math.floor(pos / width);

            piksel.push(pos);

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);

            for (let n = 0; n < 8; n++) {
                const nx = x + dx[n];
                const ny = y + dy[n];

                if (
                    nx < 0 || nx >= width ||
                    ny < 0 || ny >= height
                ) continue;

                const np = ny * width + nx;

                if (mask[np] && !dikunjungi[np]) {
                    dikunjungi[np] = 1;
                    antrean.push(np);
                }
            }
        }

        if (piksel.length < LUAS_MINIMUM) continue;

        objek.push({
            piksel,
            minX,
            minY,
            maxX,
            maxY,
            luas: piksel.length
        });
    }

    return objek.sort((a, b) => a.minX - b.minX);
}

// Normalisasi bentuk ke kanvas persegi tanpa mengubah rasio
function normalisasi(mask, width, height) {
    const hasil = new Uint8Array(UKURAN * UKURAN);

    const padding = 12;
const area = UKURAN - padding * 2;
    const scale = Math.min(
        area / width,
        area / height
    );

    const nw = Math.max(1, Math.round(width * scale));
    const nh = Math.max(1, Math.round(height * scale));

    const ox = Math.floor((UKURAN - nw) / 2);
    const oy = Math.floor((UKURAN - nh) / 2);

    for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
            const sx = Math.min(
                width - 1,
                Math.floor(x * width / nw)
            );

            const sy = Math.min(
                height - 1,
                Math.floor(y * height / nh)
            );

            if (mask[sy * width + sx]) {
                hasil[(oy + y) * UKURAN + ox + x] = 1;
            }
        }
    }

    return hasil;
}

// Putar mask huruf pada gambar asli,
// lalu normalisasi kembali tanpa mengubah rasio bentuknya.
function rotasiDanNormalisasi(mask, width, height, angle) {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Kanvas persegi cukup besar untuk menampung hasil rotasi.
    const size = Math.ceil(Math.sqrt(
        width * width + height * height
    )) + 4;

    const source = new Uint8Array(size * size);

    const offsetX = Math.floor((size - width) / 2);
    const offsetY = Math.floor((size - height) / 2);

    // Tempatkan mask asli di tengah kanvas.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x]) {
                source[
                    (offsetY + y) * size + offsetX + x
                ] = 1;
            }
        }
    }

    const rotated = new Uint8Array(size * size);
    const center = (size - 1) / 2;

    let minX = size;
    let minY = size;
    let maxX = -1;
    let maxY = -1;

    // Inverse mapping: setiap piksel output mencari
    // posisi piksel sumber yang sesuai.
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;

            const sx = Math.round(
                cos * dx + sin * dy + center
            );

            const sy = Math.round(
                -sin * dx + cos * dy + center
            );

            if (
                sx < 0 || sx >= size ||
                sy < 0 || sy >= size
            ) continue;

            if (source[sy * size + sx]) {
                rotated[y * size + x] = 1;

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        return new Uint8Array(UKURAN * UKURAN);
    }

    // Potong area kosong hasil rotasi.
    const rw = maxX - minX + 1;
    const rh = maxY - minY + 1;
    const crop = new Uint8Array(rw * rh);

    for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
            crop[y * rw + x] =
                rotated[(minY + y) * size + minX + x];
        }
    }

    return normalisasi(crop, rw, rh);
}

// Buat mask template dari channel alpha.
// Template putih tetap dikenali meskipun warna RGB-nya putih.
function maskTemplate(img) {
    const mask = new Uint8Array(img.width * img.height);

    for (let i = 0; i < mask.length; i++) {
        const p = i * 4;
        mask[i] = img.data[p + 3] > 20 ? 1 : 0;
    }

    return normalisasi(mask, img.width, img.height);
}

// Bandingkan dua mask dengan Intersection over Union
function skorCocok(a, b) {
    let irisan = 0;
    let gabungan = 0;

    for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) irisan++;
        if (a[i] || b[i]) gabungan++;
    }

    return gabungan ? irisan / gabungan : 0;
}

function fiturSisiKiri(mask) {
    const ukuran = UKURAN;
    const titik = [];

    // Periksa bagian tengah karakter
    const mulaiY = Math.floor(ukuran * 0.20);
    const akhirY = Math.floor(ukuran * 0.80);

    for (let y = mulaiY; y < akhirY; y++) {
        let minX = ukuran;
        let jumlah = 0;

        for (let x = 0; x < ukuran; x++) {
            if (mask[y * ukuran + x]) {
                minX = Math.min(minX, x);
                jumlah++;
            }
        }

        if (jumlah >= 2 && minX < ukuran) {
            titik.push({ x: minX, y });
        }
    }

    if (titik.length < 5) return 0;

    // Regresi linear untuk mengukur penyimpangan garis
    const rataY = titik.reduce((s, p) => s + p.y, 0) / titik.length;
    const rataX = titik.reduce((s, p) => s + p.x, 0) / titik.length;

    let pembilang = 0;
    let penyebut = 0;

    for (const p of titik) {
        pembilang += (p.y - rataY) * (p.x - rataX);
        penyebut += (p.y - rataY) ** 2;
    }

    const kemiringan = penyebut ? pembilang / penyebut : 0;
    const intercept = rataX - kemiringan * rataY;

    let totalError = 0;

    for (const p of titik) {
        const prediksi = kemiringan * p.y + intercept;
        totalError += (p.x - prediksi) ** 2;
    }

    const rms = Math.sqrt(totalError / titik.length);

    // Nilai mendekati 1 berarti semakin lurus
    return Math.max(0, 1 - rms / 5);
}

// Bangun template mask sekali pakai untuk dipergunakan berulang kali.
function buildTemplates() {
    const templates = {};

    for (const [huruf, base64] of Object.entries(TEMPLATES)) {
        if (base64.startsWith('BASE64_')) {
            throw new Error(`Template ${huruf} belum diisi Base64.`);
        }

        templates[huruf] = maskTemplate(
            bacaPNG(Buffer.from(base64, 'base64'))
        );
    }

    return templates;
}

// Dekode kode monster (6 karakter) dari buffer PNG.
// Mengembalikan string hasil pengenalan atau null bila tidak dikenali.
function decodeBuffer(buffer) {
    let sumber;
    try {
        sumber = bacaPNG(buffer);
    } catch (error) {
        console.error('neo3 gagal membaca PNG:', error.message);
        return null;
    }

    const latar = deteksiLatar(sumber);
    const mask = segmentasi(sumber, latar);
    const objek = cariObjek(mask, sumber.width, sumber.height);

    const templates = buildTemplates();
    const hasil = [];

    objek.forEach(obj => {
        const w = obj.maxX - obj.minX + 1;
        const h = obj.maxY - obj.minY + 1;
        const crop = new Uint8Array(w * h);

        for (const pos of obj.piksel) {
            const x = pos % sumber.width;
            const y = Math.floor(pos / sumber.width);

            crop[(y - obj.minY) * w + (x - obj.minX)] = 1;
        }

        const skorTerbaik = {};

// Uji setiap sudut rotasi untuk objek target.
// Template tetap tegak dan tidak perlu diputar.
for (
    let angle = ROTASI_MIN;
    angle <= ROTASI_MAX;
    angle += ROTASI_STEP
) {
    const bentuk = rotasiDanNormalisasi(
        crop,
        w,
        h,
        angle
    );

    for (const [huruf, template] of Object.entries(templates)) {
        const skorMentah = skorCocok(bentuk, template);

let skor = skorMentah;

// Geometric Scoring khusus B dan 8
if (huruf === 'B' || huruf === '8') {
    const fiturTarget = fiturSisiKiri(bentuk);
    const fiturTemplate = fiturSisiKiri(template);

    const skorGeometri =
        1 - Math.abs(fiturTarget - fiturTemplate);

    skor = (
        skorMentah * 0.90 +
        skorGeometri * 0.10
    );
}

        if (
            !skorTerbaik[huruf] ||
            skor > skorTerbaik[huruf].skor
        ) {
            skorTerbaik[huruf] = {
                skor,
                sudut: angle
            };
        }
    }
}

// Urutkan seluruh kandidat berdasarkan skor tertinggi.
const semuaSkor = Object.entries(skorTerbaik)
    .map(([huruf, data]) => ({
        huruf,
        skor: data.skor,
        sudut: data.sudut
    }))
    .sort((a, b) => b.skor - a.skor);

const terbaik = semuaSkor[0] || {
    huruf: '?',
    skor: 0,
    sudut: 0
};

const diterima = terbaik.skor >= AMBANG_COCOK;

        hasil.push({
            index: obj.index,
            huruf: diterima ? terbaik.huruf : '?',
            skor: terbaik.skor,
            x: obj.minX,
            y: obj.minY,
            width: w,
            height: h
        });
    });

    const kode = hasil.map(h => h.huruf).join('');
    if (!kode || kode.includes('?')) return null;
    return kode;
}

function main() {
    if (!fs.existsSync(FILE_INPUT)) {
        console.error('File tidak ditemukan:', FILE_INPUT);
        process.exit(1);
    }

    console.log('\n=== HASIL AKHIR ===');
    console.log(decodeBuffer(fs.readFileSync(FILE_INPUT)) || 'TIDAK DIKENALI');
}

module.exports = { decodeBuffer };

if (require.main === module) {
    main();
}