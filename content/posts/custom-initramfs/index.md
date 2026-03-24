+++
title = "Custom initramfs"
date = 2026-03-24T06:30:00-07:00
[taxonomies]
authors = ["Ramnath R Iyer"]
tags = ["linux"]
[extra]
allow_comments = true
+++

I like my kernel simple and lean, with just the configuration I need --- kernel modules disabled, no
*initramfs*, and all drivers and firmware built into the kernel image itself. Why, I would even
forego sophisticated bootloaders like [GRUB](https://en.wikipedia.org/wiki/GNU_GRUB), relying
instead on [EFI stub](https://wiki.archlinux.org/title/EFI_boot_stub) to load my kernel directly
from the [UEFI firmware](https://wiki.gentoo.org/wiki/UEFI) during the boot process. In my most
recent setup, however, I decided to set up a
[LUKS2-encrypted](https://en.wikipedia.org/wiki/Linux_Unified_Key_Setup)
[btrfs](https://en.wikipedia.org/wiki/Btrfs) filesystem on my main disk, and this forced me into
having an *initramfs*.

So what is an *initramfs*? Basically, when the kernel starts up, it may be provided with an "initial
[RAM](https://en.wikipedia.org/wiki/Random-access_memory) filesystem" in lieu of accessing the root
filesystem from disk. This pseudo root filesystem is just a single archive with a script called
"init". The archive may include additional binaries and libraries that are needed by this *init*
script early in the boot process. In my case, for instance, I needed to use the *cryptsetup* utility
to ask for a password and unlock the disk, in order for the kernel to gain access to it. There is
simply no other way for the kernel to access the decrypted contents of the disk and begin the
service initialization process [^1].

Tools like [dracut](https://wiki.archlinux.org/title/Dracut) can help you create an *initramfs*, but
the results tend to be ugly and bloated as they cater to the common denominator. To avoid this, I
decided to create my own *initramfs*. This turned out to be a rather simple process.


Conceptually, there are two parts to it. First, we need an [init
script](https://github.com/rri/initramfs/blob/main/etc/kernel/init.script) that acts as the entry
point and executes during the early boot process. Second, we need a [build
script](https://github.com/rri/initramfs/blob/main/etc/kernel/postinst.d/25-custom-initramfs) to
create an archive file with this *init* script, along with a [filesystem hierarchy
structure](https://en.wikipedia.org/wiki/Filesystem_Hierarchy_Standard) and required binaries and
libraries.

In the *init* script, I used a [busybox binary](https://busybox.net/) to provide the shell.

```bash
cryptsetup luksOpen "$ROOT_DEV" "$CRYPT_ROOT"`
```

[The snippet
above](https://github.com/rri/initramfs/blob/8e472a5588179afd2291240fc899bbce84ae7844/etc/kernel/init.script#L49)
is at the heart of the script --- it gets invoked up to 3 times in case the user enters the wrong
password --- with additional logic to mount the *btrfs* filesystem and resume correctly from
hibernation. The final step is to switch to the full-fledged root filesystem and start the real *init*
process from files on disk. One perk of this setup is that I can inject additional goodies into the
script. Observe that I set the keyboard backlight and display brightness as [part of the
script](https://github.com/rri/initramfs/blob/8e472a5588179afd2291240fc899bbce84ae7844/etc/kernel/init.script#L38).
What's more, I even managed to coax Claude into churning out a small binary called
[gamma](https://github.com/rri/gamma) to set the display to a 'warm' color from the very beginning.

The job of the *build* script is straightforward: bundle together all the binaries needed by the
*init* script, along with the libraries they depend on (if dynamically linked). These binaries are
*busybox*, *gamma* and *cryptsetup*. Of these, the first two are statically linked and require no
additional files. For the latter, the script includes some logic to [recursively scrape the system
for the required
libraries](https://github.com/rri/initramfs/blob/8e472a5588179afd2291240fc899bbce84ae7844/etc/kernel/postinst.d/25-custom-initramfs#L47),
placing them in the right directories and linking them just as they are on the live system. The
final step is to convert the working directory into an archive using *cpio* and compressing it with
*zstd* (which has support built into the kernel). No kernel modules are required to be loaded since
drivers for display, disk and other essential components are built into the kernel itself.

[^1]: Technically, I could use the GRUB bootloader to decrypt the disk for me before executing the
    kernel, but [until the recent version
    2.14](https://9to5linux.com/grub-2-14-released-with-erofs-argon2-kdf-and-shim-loader-protocol-support),
    GRUB did not support the fast and modern Argon2 key derivation function.)
