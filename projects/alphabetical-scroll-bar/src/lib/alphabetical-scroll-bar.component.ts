import { BooleanInput, coerceBooleanProperty, coerceNumberProperty, NumberInput } from '@angular/cdk/coercion';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DoCheck, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { fromEvent, interval, Subject, Subscription, takeUntil } from 'rxjs';

@Component({
  selector: 'alphabetical-scroll-bar',
  templateUrl: './alphabetical-scroll-bar.component.html',
  styleUrls: ['./alphabetical-scroll-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlphabeticalScrollBarComponent implements AfterViewInit, DoCheck, OnDestroy {

  constructor(private _cdr: ChangeDetectorRef) { }

  @ViewChild('alphabetContainer', { static: true }) alphabetContainer: ElementRef;

  get alphabet(): string[] { return this._alphabet; }
  @Input() set alphabet(value: string[]) {
    this._alphabet = value;
    this.checkVisibleLetters(true);
  }
  private _alphabet: Array<string> = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

  get validLetters(): string[] { return this._validLetters; }
  @Input() set validLetters(value: string[]) {
    this._validLetters = value;
    this.checkVisibleLetters(true);
  }
  private _validLetters: Array<string>;

  get letterMagnification(): boolean { return this._letterMagnification; }
  @Input() set letterMagnification(value: BooleanInput) { this._letterMagnification = coerceBooleanProperty(value); }
  private _letterMagnification = false;

  get exactX(): boolean { return this._exactX; }
  @Input() set exactX(value: BooleanInput) { this._exactX = coerceBooleanProperty(value); }
  private _exactX = false;

  get navigateOnHover(): boolean { return this._navigateOnHover; }
  @Input() set navigateOnHover(value: BooleanInput) { this._navigateOnHover = coerceBooleanProperty(value); }
  private _navigateOnHover = false;

  get letterSpacing(): number | string | null { return this._letterSpacing; }
  @Input() set letterSpacing(value: number | string | null) {
    if (typeof value === 'string') {
      this._letterSpacing = this.stringToNumber(value);
      if (value.includes('%')) { this._letterSpacing = this._letterSpacing.toString() + '%'; }
    }
    else { this._letterSpacing = coerceNumberProperty(value); }

    this.checkVisibleLetters(true);
  }
  private _letterSpacing: number | string | null = '1.75%';

  @Output('letterChange') letterChange$ = new EventEmitter<string>();
  @Output('isActive') isActive$ = new EventEmitter<boolean>();
  private _lastEmittedActive = false;
  private _isComponentActive = false;

  private readonly _cancellationToken$: Subject<void> = new Subject();
  readonly hiddenLetterValue = '·';

  //This interval can be used for fast, regular size-checks
  //Useful, if e.g. a splitter-component resizes the scroll-bar but not the window itself
  get offsetSizeCheckInterval(): number { return this._offsetSizeCheckInterval; }
  @Input() set offsetSizeCheckInterval(value: NumberInput) {
    this._offsetSizeCheckIntervalSubscription?.unsubscribe();
    this._offsetSizeCheckInterval = coerceNumberProperty(value);
    this._offsetSizeCheckInterval && (this._offsetSizeCheckIntervalSubscription = interval(this._offsetSizeCheckInterval).pipe(takeUntil(this._cancellationToken$)).subscribe(() => this.checkVisibleLetters()));
  }
  private _offsetSizeCheckInterval = 0;
  private _offsetSizeCheckIntervalSubscription: Subscription;

  ngAfterViewInit(): void { fromEvent(window, 'resize').pipe(takeUntil(this._cancellationToken$)).subscribe(() => this.checkVisibleLetters()); }
  ngDoCheck(): void { this.checkVisibleLetters(); }
  ngOnDestroy() { this._cancellationToken$.next(); this._cancellationToken$.complete(); }

  checkVisibleLetters(force?: boolean): void {
    let height = this.alphabetContainer.nativeElement.clientHeight;
    if (!force && height === this._lastHeight) { return; }

    this._lastHeight = height;

    let newAlphabet = this.alphabet;
    let letterSpacing = 0;
    const letterSize = this.stringToNumber(getComputedStyle(this.alphabetContainer.nativeElement).getPropertyValue('font-size'));

    //Calculate actual letter spacing
    if (typeof this.letterSpacing === 'number') { letterSpacing = this.letterSpacing; }
    else if (typeof this.letterSpacing === 'string') {
      letterSpacing = this.stringToNumber(this.letterSpacing);
      if (this.letterSpacing.endsWith('%')) { letterSpacing = height * (letterSpacing / 100); }
    }

    height = this._lastHeight - (Math.max(0, newAlphabet.length - 1)) * letterSpacing;

    //Remove invalid letters (if set and necessary)
    if (!!this.validLetters && height / letterSize < newAlphabet.length) {
      newAlphabet = this.validLetters;
      height = this._lastHeight - (Math.max(0, newAlphabet.length - 1)) * letterSpacing;
    }

    //Check if there is enough free space for letters
    this._lettersShortened = height / letterSize < newAlphabet.length;
    if (this._lettersShortened) {
      const numHiddenLetters = newAlphabet.length - Math.floor(height / letterSize);

      //determine how many letters to hide
      //BUG: If area gets too small, A·Z becomes A...Z - maybe rework this area?
      const hiddenHalves = this.getNumHiddenHalves(numHiddenLetters, newAlphabet.length) + 1;

      //split alphabet into two halves
      let alphabet1 = newAlphabet.slice(0, Math.ceil(newAlphabet.length / 2));
      let alphabet2 = newAlphabet.slice(Math.floor(newAlphabet.length / 2)).reverse();

      for (let i = 0; i < hiddenHalves; i++) {
        alphabet1 = alphabet1.filter((l, i) => i % 2 === 0);
        alphabet2 = alphabet2.filter((l, i) => i % 2 === 0);
      }

      //insert dots between letters
      alphabet1 = alphabet1.reduce((prev, curr, i) => {
        if (i > 0) { prev.push(this.hiddenLetterValue); }
        prev.push(curr);
        return prev;
      }, []);
      alphabet2 = alphabet2.reduce((prev, curr, i) => {
        if (i > 0) { prev.push(this.hiddenLetterValue); }
        prev.push(curr);
        return prev;
      }, []);

      if (this.alphabet.length % 2 === 0) alphabet1.push(this.hiddenLetterValue);
      newAlphabet = alphabet1.concat(alphabet2.reverse());
    }

    this._cdr.markForCheck();
    this.visibleLetters = newAlphabet;
  }
  private _lastHeight: number;
  visibleLetters: Array<string>;
  //Flag for determining letter under pointer
  private _lettersShortened = false;

  getNumHiddenHalves(numHiddenLetters: number, total: number) {
    if (numHiddenLetters > total / 2) {
      return (
        1 +
        this.getNumHiddenHalves(
          numHiddenLetters % (total / 2),
          Math.ceil(total / 2)
        )
      );
    }
    return 0;
  }

  isValid(letter: string): boolean {
    return this.validLetters?.includes(letter) !== false;
  }

  isActive(i: number, neightbor?: number): boolean {
    neightbor ??= 0;
    return this._isComponentActive && this.letterMagnification && (this.visualLetterIndex - neightbor === i || this.visualLetterIndex + neightbor === i);
  }

  @HostListener('mousemove', ['$event', 'true'])
  @HostListener('mouseenter', ['$event', 'true'])
  @HostListener('touchmove', ['$event'])
  @HostListener('touchstart', ['$event'])
  @HostListener('click', ['$event'])
  focusEvent(event: MouseEvent & TouchEvent, isMouseMove?: boolean) {
    if (!this._lastEmittedActive) { this.isActive$.emit(this._lastEmittedActive = true); }
    this._isComponentActive = true;

    this.setLetterFromCoordinates(
      event.touches?.[0].clientX ?? event.clientX,
      event.touches?.[0].clientY ?? event.clientY
    );

    if (this._lastEmittedLetter !== this.letterSelected && (this.navigateOnHover || !isMouseMove)) { this.letterChange$.emit(this._lastEmittedLetter = this.letterSelected); }
  }
  private _lastEmittedLetter: string;

  @HostListener('mouseleave')
  @HostListener('touchend')
  focusEnd(): void {
    this.isActive$.emit(this._isComponentActive = this._lastEmittedActive = false);
  }

  private setLetterFromCoordinates(x: number, y: number): void {
    if (this.exactX) {
      const rightX = this.alphabetContainer.nativeElement.getBoundingClientRect().right;
      const leftX = this.alphabetContainer.nativeElement.getBoundingClientRect().left;

      this._isComponentActive = x > leftX && x < rightX;
      if (!this._isComponentActive) { this.visualLetterIndex = this.visualLetterIndex = null; return; }
    }

    const height = this.alphabetContainer.nativeElement.clientHeight;
    //Letters drew outside the viewport or host padding may cause values outsize height boundries (Usage of min/max)
    const top = Math.min(Math.max(0, y - this.alphabetContainer.nativeElement.getBoundingClientRect().top), height);

    let topRelative = (top / height) * (this.visibleLetters.length - 1);
    const preferNext = Math.round(topRelative) < topRelative;
    topRelative = Math.round(topRelative);

    //Set visualLetterIndex to the closest valid letter
    this.visualLetterIndex = this.getClosestValidLetterIndex(this.visibleLetters, topRelative, preferNext);

    if (this._lettersShortened) {
      if (this.validLetters) {
        this.letterSelected = this.validLetters[Math.round((top / height) * (this.validLetters.length - 1))];
      } else {
        this.letterSelected = this.alphabet[this.getClosestValidLetterIndex(this.alphabet, topRelative, preferNext)];
      }
    } else {
      this.letterSelected = this.visibleLetters[this.visualLetterIndex];
    }
  }
  visualLetterIndex: number;
  letterSelected: string;

  private getClosestValidLetterIndex(alphabet: string[], visualLetterIndex: number, preferNext: boolean): number {
    const lowercaseAlphabet = alphabet.map(l => l.toLowerCase());
    const lowercaseValidLetters = this.validLetters.map(l => l.toLowerCase());
    const validLettersAsNumbers = lowercaseValidLetters.map(l => lowercaseAlphabet.indexOf(l));

    return validLettersAsNumbers.reduce((prev, curr) =>
      preferNext ?
        (Math.abs(curr - visualLetterIndex) > Math.abs(prev - visualLetterIndex) ? prev : curr) :
        (Math.abs(curr - visualLetterIndex) < Math.abs(prev - visualLetterIndex) ? curr : prev)
    );
  }

  private stringToNumber(value?: string): number {
    return Number(value?.match(/[\.\d]+/)[0]);
  }
}
