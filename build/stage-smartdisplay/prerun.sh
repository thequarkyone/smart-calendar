#!/bin/bash -e
# Standard pi-gen prerun: copy the previous stage's rootfs into our work directory.
if [ ! -d "${ROOTFS_DIR}" ]; then
    copy_previous
fi
